import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { apiFetchResponse } from "@/shared/api/client";
import { validateModel } from "../preview/modelContract";
import { libraryPreviewMaterial } from "../preview/previewStyle";
import type { StaticAsset } from "./contract";
import { measure } from "./metrics";

export function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function verifyBytes(bytes: ArrayBuffer, sha: string) {
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== sha)
    throw Error("asset digest mismatch");
}
/** Read incrementally so a misleading Content-Length cannot allocate an unbounded artifact. */
export async function boundedBytes(response: Response, limit: number, signal: AbortSignal) {
  if (Number(response.headers.get("Content-Length") ?? 0) > limit) throw Error("asset size");
  if (!response.body) throw Error("missing artifact body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw Error("asset size");
      chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export class BoundedQueue {
  private running = 0;
  private pending: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.pending = this.pending.filter((p) => p !== start);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          abort();
          return;
        }
        this.running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.drain();
          });
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      this.pending.push(start);
      this.drain();
    });
  }
  private drain() {
    while (this.running < this.limit && this.pending.length) this.pending.shift()!();
  }
}
const downloads = new BoundedQueue(2);
const parses = new BoundedQueue(1);
type Entry = { body: THREE.Group; refs: number; size: number; used: number };
const cache = new Map<string, Entry>();
const loading = new Map<
  string,
  { promise: Promise<Entry>; controller: AbortController; users: number }
>();
function dispose(body: THREE.Group) {
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}
function evict() {
  let bytes = [...cache.values()].reduce((n, e) => n + e.size, 0);
  for (const [key, entry] of [...cache].sort((a, b) => a[1].used - b[1].used)) {
    if (bytes <= 24 * 1024 * 1024 && cache.size <= 8) break;
    if (entry.refs) continue;
    dispose(entry.body);
    cache.delete(key);
    bytes -= entry.size;
  }
}
function keyFor(asset: StaticAsset) {
  return JSON.stringify([
    asset.sha256,
    asset.sourceSha256,
    asset.characterSha256,
    asset.characterId,
    asset.revision,
    asset.scope,
    asset.modelVersion,
  ]);
}
export async function acquireAsset(asset: StaticAsset, signal: AbortSignal) {
  if (asset.camera.baked !== "none") throw Error("unsupported baked static asset");
  const key = keyFor(asset);
  const started = performance.now();
  let entry = cache.get(key);
  if (!entry) {
    let pending = loading.get(key);
    if (!pending) {
      const controller = new AbortController();
      const sharedSignal = controller.signal;
      const promise = downloads
        .run(async () => {
          const begin = performance.now();
          const response = await apiFetchResponse(asset.url, {
            auth: false,
            signal: sharedSignal,
            cache: "no-store",
          });
          if (response.headers.get("Content-Type")?.split(";")[0] !== "model/gltf-binary")
            throw Error("asset type");
          const data = await boundedBytes(response, asset.bytes, sharedSignal);
          if (data.byteLength !== asset.bytes) throw Error("asset length");
          await verifyBytes(data, asset.sha256);
          validateModel(data, asset.sourceSha256, asset.characterId, {
            url: asset.url,
            rotation: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ],
            sourceSha: asset.sourceSha256,
            scope: asset.scope,
            version: asset.modelVersion,
            characterSha256: asset.characterSha256,
            modelRevision: asset.revision,
          });
          measure("download", begin, "cold");
          return parses.run(async () => {
            const begin = performance.now();
            const loader = new GLTFLoader();
            loader.manager.setURLModifier(() => {
              throw Error("external asset resource");
            });
            const { scene: body } = await loader.parseAsync(data, "");
            try {
              sharedSignal.throwIfAborted();
              let vertices = 0;
              body.traverse((o) => {
                if (!(o instanceof THREE.Mesh)) return;
                const p = o.geometry.getAttribute("position");
                vertices += p.count;
                for (let i = 0; i < p.count; i++)
                  if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite))
                    throw Error("invalid geometry");
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
                o.material = libraryPreviewMaterial();
                // Search projection can reverse screen winding. Preserve the
                // actual outer surface, including open edges of cropped scopes.
                o.material.side = THREE.DoubleSide;
              });
              if (!vertices || vertices > 500000) throw Error("geometry budget");
              const result = { body, refs: 0, size: data.byteLength, used: performance.now() };
              cache.set(key, result);
              measure("parse", begin, "cold");
              return result;
            } catch (error) {
              dispose(body);
              throw error;
            }
          }, sharedSignal);
        }, sharedSignal)
        .finally(() => {
          loading.delete(key);
        });
      pending = { promise, controller, users: 0 };
      loading.set(key, pending);
    }
    pending.users++;
    const current = pending;
    let released = false;
    const releaseWaiter = () => {
      if (released) return;
      released = true;
      current.users--;
      if (!current.users && !cache.has(key)) current.controller.abort();
    };
    signal.addEventListener("abort", releaseWaiter, { once: true });
    try {
      signal.throwIfAborted();
      entry = await current.promise;
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", releaseWaiter);
      releaseWaiter();
    }
  } else measure("download", started, "warm");
  entry.refs++;
  entry.used = performance.now();
  evict();
  // Static clones share immutable geometry/material; observations live in the viewport.
  const body = entry.body.clone(true);
  let released = false;
  return {
    body,
    release() {
      if (released) return;
      released = true;
      entry!.refs--;
      entry!.used = performance.now();
      evict();
    },
  };
}
export function clearUnusedAssets() {
  for (const [key, e] of cache)
    if (!e.refs) {
      dispose(e.body);
      cache.delete(key);
    }
}
export function assetResources() {
  return {
    entries: cache.size,
    active: [...cache.values()].reduce((n, e) => n + e.refs, 0),
    bytes: [...cache.values()].reduce((n, e) => n + e.size, 0),
    loading: loading.size,
  };
}
