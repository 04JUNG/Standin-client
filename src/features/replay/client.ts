import { replayFetch } from "./http";
import { create } from "zustand";
import { replayObservation } from "@/shared/lib/replayBridge";
import { safeStorage } from "@/shared/lib/safeStorage";
import { apiFetchBlob, currentInstallationId } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { appSession, initializeAppSession, sessionClock } from "@/shared/lib/appSession";
import { replayConfig, REPLAY_POLICY, REPLAY_PROTOCOL } from "./config";
import { base64, encodeEvents, sha256 } from "./encoding";
import {
  clearReplayQueue,
  enqueue,
  queueItems,
  removeQueued,
  persistWithdrawal,
  persistedWithdrawal,
  pendingWithdrawal,
  persistPendingWithdrawal,
  type QueueItem,
} from "./queue";
import { sanitizeReplay } from "./privacy";

export const useReplayStatus = create<{
  state: string;
  queuedBytes: number;
  uploadedBytes: number;
  gaps: number;
}>(() => ({ state: "idle", queuedBytes: 0, uploadedBytes: 0, gaps: 0 }));
export type ReplayAsset = {
  kind:
    "rough" | "thumbnail" | "final" | "csp_result" | "capture_background" | "canvas_frame" | "font";
  snapshotVersion: string;
  jobId?: string;
  inputAttemptId?: string;
  artifactHash?: string;
  sourceExpiresAt?: string;
};
type Context = {
  owner: string;
  replayId: string;
  windowId: string;
  startedAt: number;
  generation: number;
};
let context: Context | undefined;
let generation = 0;
let flushing: Promise<void> | undefined;
let retryAt = 0;
let recordingBytes = 0;
let sequence = new Map<string, number>();
let ordered = Promise.resolve();
let pendingChunks = 0;
let aborter = new AbortController();
const assetCache = new Map<string, Promise<string>>();
const withdrawalKey = "standin.replay.withdrawn.v1";
const pendingWithdrawalKey = "standin.replay.withdrawal.pending.v1";
const withdrawalRequests = new Map<string, Promise<void>>();
export const replayWithdrawn = () => safeStorage.getItem(withdrawalKey) === "true";
export const replayActive = () => Boolean(context);
export function replayGap(reason: string) {
  useReplayStatus.setState((s) => ({ gaps: s.gaps + 1, state: reason }));
  replayObservation("replay_gap", { reason });
}
export function replayContext() {
  return context;
}
function active(ctx: Context) {
  return context === ctx && ctx.generation === generation && !aborter.signal.aborted;
}
async function queueRequest(
  ctx: Context,
  path: string,
  body: unknown,
  method: "PUT" | "POST" = "PUT",
  bindingId?: string,
) {
  if (!active(ctx)) return;
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  recordingBytes += bytes;
  if (recordingBytes > 60 * 1024 * 1024 || Date.now() - ctx.startedAt > 4 * 60 * 60_000) {
    replayGap("session_limit");
    stopReplay();
    return;
  }
  const dropped = await enqueue({
    id: `${ctx.replayId}:${path}${bindingId ? `:${bindingId}` : ""}`,
    owner: ctx.owner,
    replayId: ctx.replayId,
    path,
    method,
    body,
    bytes,
    createdAt: Date.now(),
  });
  if (!active(ctx)) {
    await clearReplayQueue();
    return;
  }
  if (dropped) replayGap("queue_limit_or_expired");
  void flushReplay();
}
export async function beginReplay(owner: string, qualityConsentId?: string) {
  await retryReplayWithdrawal(owner).catch(() => replayGap("withdrawal_pending"));
  if (context?.owner === owner) return;
  const config = replayConfig();
  if (await persistedWithdrawal()) safeStorage.setItem(withdrawalKey, "true");
  if (
    !config.enabled ||
    !config.allowed ||
    replayWithdrawn() ||
    (config.authorizationMode === "explicit" && !qualityConsentId)
  ) {
    stopReplay();
    await clearReplayQueue();
    useReplayStatus.setState({ state: !config.allowed ? "authorization_denied" : "disabled" });
    return;
  }
  stopReplay();
  const startingGeneration = generation;
  await initializeAppSession();
  if (startingGeneration !== generation) return;
  aborter = new AbortController();
  recordingBytes = 0;
  retryAt = 0;
  sequence = new Map();
  assetCache.clear();
  const session = appSession();
  const ctx: Context = {
    owner,
    replayId: session.appSessionId,
    windowId: crypto.randomUUID(),
    startedAt: session.startedAt,
    generation,
  };
  context = ctx;
  useReplayStatus.setState({ state: "recording" });
  // A recovered queue is sent under the original owner only, never relabelled.
  for (const item of await queueItems()) if (item.owner !== owner) await removeQueued(item.id);
  await queueRequest(
    ctx,
    "/v1/replays",
    {
      protocolVersion: REPLAY_PROTOCOL,
      replayId: ctx.replayId,
      appSessionId: session.appSessionId,
      startedAt: session.startedAt,
      appVersion: import.meta.env.VITE_APP_VERSION || "unknown",
      os: navigator.platform.toLowerCase().includes("mac")
        ? "macos"
        : navigator.platform.toLowerCase().includes("win")
          ? "windows"
          : "linux",
      authorizationMode: config.authorizationMode,
      policyVersion: REPLAY_POLICY,
    },
    "POST",
  );
}
export function stopReplay() {
  generation++;
  aborter.abort();
  context = undefined;
  assetCache.clear();
  useReplayStatus.setState({ state: "stopped" });
}
export async function withdrawReplay() {
  const owner = currentInstallationId();
  safeStorage.setItem(withdrawalKey, "true");
  if (owner) safeStorage.setItem(pendingWithdrawalKey, owner);
  stopReplay();
  await Promise.allSettled([
    persistWithdrawal(true),
    ...(owner ? [persistPendingWithdrawal(owner, true)] : []),
    clearReplayQueue(),
  ]);
  if (owner) await retryReplayWithdrawal(owner);
}
/** Runs even with recording disabled/withdrawn, and only with the original owner's auth. */
export function retryReplayWithdrawal(owner: string): Promise<void> {
  const existing = withdrawalRequests.get(owner);
  if (existing) return existing;
  const request = (async () => {
    const pending =
      safeStorage.getItem(pendingWithdrawalKey) === owner || (await pendingWithdrawal(owner));
    // Check after the asynchronous storage read, immediately before auth headers are built.
    if (!pending || currentInstallationId() !== owner) return;
    safeStorage.setItem(withdrawalKey, "true");
    await replayFetch("/v1/replays", { method: "DELETE", auth: false });
    await persistPendingWithdrawal(owner, false);
    if (safeStorage.getItem(pendingWithdrawalKey) === owner)
      safeStorage.removeItem(pendingWithdrawalKey);
  })().finally(() => withdrawalRequests.delete(owner));
  withdrawalRequests.set(owner, request);
  return request;
}
export async function flushReplay(): Promise<void> {
  const owner = currentInstallationId();
  if (owner) await retryReplayWithdrawal(owner).catch(() => replayGap("withdrawal_pending"));
  if (flushing) return flushing;
  const ctx = context;
  if (!ctx || Date.now() < retryAt || replayWithdrawn()) return Promise.resolve();
  const signal = aborter.signal;
  flushing = (async () => {
    const items = (await queueItems()).sort((a, b) => a.createdAt - b.createdAt);
    useReplayStatus.setState({ queuedBytes: items.reduce((s, i) => s + i.bytes, 0) });
    for (const item of items) {
      if (!active(ctx)) return;
      if (item.owner !== ctx.owner || Date.now() - item.createdAt > 24 * 60 * 60_000) {
        await removeQueued(item.id);
        replayGap("queue_expired");
        continue;
      }
      try {
        await replayFetch(item.path, { method: item.method, body: item.body, auth: false, signal });
        await removeQueued(item.id);
        useReplayStatus.setState((s) => ({
          uploadedBytes: s.uploadedBytes + item.bytes,
          queuedBytes: Math.max(0, s.queuedBytes - item.bytes),
        }));
      } catch (error) {
        if (!active(ctx)) return;
        if (error instanceof ApiError && [400, 403, 404, 409, 410, 413].includes(error.status)) {
          await removeQueued(item.id);
          replayGap(`rejected_${error.status}`);
          // Start/ownership/withdrawal rejection must not drain content into a nonexistent session.
          if (item.path === "/v1/replays" || error.status === 403) {
            stopReplay();
            await clearReplayQueue();
            return;
          }
          continue;
        }
        retryAt =
          Date.now() +
          (error instanceof ApiError ? (error.retryAfterSeconds ?? 10) * 1000 : 10_000);
        useReplayStatus.setState({ state: "upload_pending" });
        return;
      }
    }
  })()
    .catch(() => replayGap("queue_unavailable"))
    .finally(() => {
      flushing = undefined;
    });
  return flushing;
}
export async function storeReplayAsset(blob: Blob, metadata: ReplayAsset): Promise<string> {
  const ctx = context;
  if (
    !ctx ||
    blob.size > 8 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp", "font/woff2"].includes(blob.type)
  )
    throw new Error("asset_unavailable");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256(bytes);
  // One byte hash may have multiple immutable semantic/version/job/expiry bindings.
  const bindingId = await sha256(
    new TextEncoder().encode(
      JSON.stringify(Object.entries(metadata).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    ),
  );
  if (!active(ctx)) throw new Error("recording_stopped");
  await queueRequest(
    ctx,
    `/v1/replays/${ctx.replayId}/assets/${hash}`,
    {
      contentType: blob.type,
      dataBase64: base64(bytes),
      ...metadata,
    },
    "PUT",
    bindingId,
  );
  return hash;
}
async function preserveSource(source: string, kind: ReplayAsset["kind"] = "thumbnail") {
  if (source.startsWith("replay-asset://")) return source;
  if (!assetCache.has(source)) {
    if (assetCache.size >= 450) return "";
    assetCache.set(
      source,
      (async () => {
        const apiOrigin = new URL((await import("@/shared/lib/env")).env.apiBaseUrl).origin;
        const url = new URL(source, source.startsWith("/v1/") ? apiOrigin : location.href);
        if (
          !["data:", "blob:"].includes(url.protocol) &&
          ![location.origin, apiOrigin].includes(url.origin)
        )
          throw new Error("external_asset");
        const blob =
          ["data:", "blob:"].includes(url.protocol) || url.origin === location.origin
            ? await (await fetch(url.href)).blob()
            : await apiFetchBlob(url.href, { auth: false });
        const hash = await storeReplayAsset(blob, { kind, snapshotVersion: "content-sha256-v1" });
        return `replay-asset://${hash}`;
      })().catch(() => {
        replayGap("asset_missing");
        return "";
      }),
    );
  }
  return assetCache.get(source)!;
}
async function rewriteAssets(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(rewriteAssets));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      (["src", "rr_dataURL", "poster"].includes(key) ||
        /(?:thumbnail|image|preview)Url$/i.test(key)) &&
      typeof item === "string" &&
      item
    )
      result[key] = await preserveSource(item);
    else if (["href", "srcset", "action", "formaction"].includes(key)) result[key] = "";
    else if (typeof item === "string" && /url\(/i.test(item))
      result[key] = item.replace(/url\([^)]*\)/gi, "none");
    else result[key] = await rewriteAssets(item);
  }
  return result;
}
export function sendReplayEvents(
  surface: "app" | "bar" | "capture",
  events: unknown[],
  links: {
    jobId?: string;
    inputAttemptId?: string;
    attemptId?: string;
    feature?: string;
    screen?: string;
    failed?: boolean;
    saveState?: string;
  } = {},
) {
  const ctx = context;
  if (!ctx || !events.length) return;
  if (pendingChunks >= 8) {
    replayGap("serialization_backlog");
    return;
  }
  pendingChunks++;
  const stream = `${ctx.windowId}_${surface}`;
  const seq = sequence.get(stream) ?? 0;
  sequence.set(stream, seq + 1);
  const captured = events;
  ordered = ordered
    .then(async () => {
      if (!active(ctx)) return;
      const clean = sanitizeReplay(await rewriteAssets(captured)) as Array<{ timestamp: number }>;
      const encoded = await encodeEvents(clean);
      if (encoded.rawBytes > 1024 * 1024) {
        replayGap("chunk_too_large");
        return;
      }
      const offset = (time: number) =>
        Math.min(14_400_000, Math.max(0, Math.round(time - appSession().startedAt)));
      await queueRequest(ctx, `/v1/replays/${ctx.replayId}/streams/${stream}/chunks/${seq}`, {
        protocolVersion: REPLAY_PROTOCOL,
        surface,
        contentHash: encoded.contentHash,
        encoding: encoded.encoding,
        data: encoded.data,
        startedOffsetMs: offset(clean[0].timestamp),
        endedOffsetMs: offset(clean[clean.length - 1].timestamp),
        clock: sessionClock(),
        failed: false,
        saveState: "unknown",
        ...links,
      });
    })
    .catch(() => replayGap("recording_error"))
    .finally(() => {
      pendingChunks--;
    });
}
export async function finishReplay() {
  const ctx = context;
  if (!ctx) return;
  await ordered;
  const streams = [...sequence].map(([windowInstanceId, next]) => ({
    windowInstanceId,
    lastSequence: next - 1,
  }));
  await queueRequest(
    ctx,
    `/v1/replays/${ctx.replayId}/finish`,
    { streams, reason: "completed" },
    "POST",
  );
  await flushReplay();
}
export async function settleReplay() {
  await ordered;
  await flushReplay();
}
export type { QueueItem };
