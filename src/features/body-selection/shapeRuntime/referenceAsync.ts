import type { BlenderControls } from "./common";
import { parseReferenceHeader, type ReferenceRuntime } from "./referenceFormat";
type Result = { positions: Float32Array; computeMs: number };
type Job = {
  runtime: ReferenceRuntime;
  controls: BlenderControls;
  resolve: (value: Result) => void;
  reject: (error: Error) => void;
};
// One worker bounds memory even when many saved-card thumbnails mount together.
let worker: Worker | undefined,
  identity: string | undefined,
  active: Job | undefined,
  ready = false;
let timer: ReturnType<typeof setTimeout> | undefined,
  idle: ReturnType<typeof setTimeout> | undefined;
const queue: Job[] = [];
function stop() {
  worker?.terminate();
  worker = undefined;
  identity = undefined;
  ready = false;
  clearTimeout(timer);
  clearTimeout(idle);
}
function fail() {
  const jobs = [...(active ? [active] : []), ...queue.splice(0)];
  active = undefined;
  stop();
  for (const job of jobs) job.reject(new Error("shape reference: calculation failed"));
}
function pump() {
  if (active || !queue.length) return;
  clearTimeout(idle);
  active = queue.shift()!;
  try {
    const key = JSON.stringify(active.runtime.header);
    if (identity !== key) {
      stop();
      identity = key;
      worker = new Worker(new URL("./reference.worker.ts", import.meta.url), { type: "module" });
      worker.onerror = fail;
      worker.onmessage = (
        event: MessageEvent<{ kind: string; positions?: Float32Array; computeMs?: number }>,
      ) => {
        if (event.data.kind === "ready") {
          ready = true;
          try {
            send();
          } catch {
            fail();
          }
          return;
        }
        if (
          event.data.kind !== "result" ||
          !active ||
          !(event.data.positions instanceof Float32Array) ||
          event.data.positions.length !== active.runtime.header.vertexCount * 3 ||
          !Number.isFinite(event.data.computeMs)
        ) {
          fail();
          return;
        }
        clearTimeout(timer);
        const job = active;
        active = undefined;
        job.resolve({ positions: event.data.positions, computeMs: event.data.computeMs! });
        pump();
        if (!active) idle = setTimeout(stop, 30000);
      };
      worker.postMessage({
        kind: "init",
        header: active.runtime.header,
        compressed: active.runtime.compressed,
      });
    } else if (ready) send();
    if (active) timer = setTimeout(fail, 30000);
  } catch {
    fail();
  }
}
function send() {
  if (active && worker) worker.postMessage({ kind: "compute", controls: active.controls });
}
export function computeReferenceAsync(
  runtime: ReferenceRuntime,
  controls: BlenderControls,
  priority: "preview" | "thumbnail" = "preview",
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const job = { runtime, controls: { ...controls }, resolve, reject };
    if (priority === "preview") queue.unshift(job);
    else queue.push(job);
    pump();
  });
}

/** Decode and validate the large graph away from the UI thread. Only the small
 * preview index array and compressed immutable bytes are retained by React Query. */
export async function parseReferenceAsync(
  value: unknown,
  compressed: Uint8Array,
): Promise<ReferenceRuntime> {
  const header = parseReferenceHeader(value);
  return new Promise((resolve, reject) => {
    let validator: Worker | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      validator?.terminate();
      clearTimeout(timeout);
    };
    const failed = () => {
      cleanup();
      reject(new Error("shape reference: validation failed"));
    };
    try {
      validator = new Worker(new URL("./reference.worker.ts", import.meta.url), { type: "module" });
      validator.onerror = failed;
      validator.onmessage = (event: MessageEvent<{ kind: string; faces?: Uint16Array }>) => {
        const faces = event.data.faces;
        if (
          event.data.kind !== "ready" ||
          !(faces instanceof Uint16Array) ||
          faces.length !== header.faceCount * 3 ||
          faces.some((i) => i >= header.vertexCount)
        ) {
          failed();
          return;
        }
        cleanup();
        resolve({ kind: "reference", header, faces, compressed: compressed.slice() });
      };
      timeout = setTimeout(failed, 30000);
      validator.postMessage({ kind: "init", header, compressed });
    } catch {
      failed();
    }
  });
}
