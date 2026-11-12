import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { gunzipSync, strFromU8 } from "fflate";
import { replayConfig } from "./config";
import { sanitizeReplay } from "./privacy";
import { encodeEvents } from "./encoding";
import {
  clearReplayQueue,
  enqueue,
  queueItems,
  persistWithdrawal,
  pendingWithdrawal,
  persistPendingWithdrawal,
} from "./queue";
import { setInstallationCredentials } from "@/shared/api/client";
import {
  beginReplay,
  replayActive,
  settleReplay,
  sendReplayEvents,
  stopReplay,
  withdrawReplay,
  flushReplay,
  retryReplayWithdrawal,
  storeReplayAsset,
} from "./client";
import { safeStorage } from "@/shared/lib/safeStorage";
// Exercise upgrade from the first shipped payload-only database as well as new writes.
beforeAll(
  () =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("standin-replay-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("queue", { keyPath: "id" });
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    }),
);
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("VITE_REPLAY_ENABLED", "true");
  vi.stubEnv("VITE_APP_ENV", "development");
  safeStorage.removeItem("standin.replay.withdrawn.v1");
  safeStorage.removeItem("standin.replay.withdrawal.pending.v1");
  stopReplay();
  await clearReplayQueue();
  await persistWithdrawal(false);
  await persistPendingWithdrawal("owner", false);
  setInstallationCredentials({ installationId: "owner", deviceToken: "fixture-not-a-real-token" });
});
afterEach(() => {
  stopReplay();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("defaults ON and assumed only in development/staging; explicit false wins", () => {
  expect(replayConfig({})).toMatchObject({
    enabled: true,
    captureEnabled: true,
    cspEnabled: true,
    authorizationMode: "assumed",
    allowed: true,
  });
  expect(replayConfig({ PROD: true }).allowed).toBe(false);
  expect(replayConfig({ VITE_APP_ENV: "production" }).allowed).toBe(false);
  expect(replayConfig({ VITE_APP_ENV: "staging", PROD: true }).allowed).toBe(true);
  expect(replayConfig({ VITE_REPLAY_ENABLED: "false" }).enabled).toBe(false);
});
it("scrubs credentials/full paths before persistence and retains allowed search text and immutable assets", () => {
  const clean = sanitizeReplay({
    query: "두 팔을 올린 자세",
    password: "never",
    __TAURI_INTERNALS__: "never",
    fullPath: "/Users/sample/secret.png",
    attributes: { title: "C:\\Users\\sample\\file.fbx", src: "replay-asset://" + "a".repeat(64) },
    text: "Bearer abcdefghijklmnop https://example.com/?token=secret",
  });
  expect(JSON.stringify(clean)).not.toMatch(/secret|never|Bearer|https:|C:\\|\/Users\//);
  expect(clean).toMatchObject({
    query: "두 팔을 올린 자세",
    attributes: { src: "replay-asset://" + "a".repeat(64) },
  });
});
it("compresses exact event bytes with a stable SHA-256 for idempotent BFF verification", async () => {
  const events = [
    { type: 5, timestamp: Date.now(), data: { tag: "search_input", payload: { query: "자세" } } },
  ];
  const first = await encodeEvents(events),
    second = await encodeEvents(events);
  expect(first).toEqual(second);
  expect(strFromU8(gunzipSync(Uint8Array.from(atob(first.data), (c) => c.charCodeAt(0))))).toBe(
    JSON.stringify(events),
  );
  expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
});
it("bounds persisted queue bytes/age and never relabels ownership", async () => {
  const item = {
    id: "old",
    owner: "other",
    replayId: "replay",
    path: "/v1/replays",
    method: "POST" as const,
    body: {},
    bytes: 7 * 1024 * 1024,
    createdAt: Date.now(),
  };
  await enqueue(item);
  expect(await enqueue({ ...item, id: "new", createdAt: Date.now() + 1 })).toBe(1);
  expect((await queueItems()).map((i) => i.id)).toEqual(["new"]);
  await enqueue({ ...item, id: "expired", bytes: 1, createdAt: Date.now() - 25 * 60 * 60_000 });
  expect((await queueItems()).map((i) => i.id)).toEqual(["new"]);
});
it("uses real API transport and strict gzip schema without changing quality consent", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await beginReplay("owner");
  sendReplayEvents("bar", [
    {
      type: 5,
      timestamp: Date.now(),
      data: { tag: "search_input", payload: { query: "owned sample" } },
    },
  ]);
  await settleReplay();
  await settleReplay();
  expect(replayActive()).toBe(true);
  const requests = fetch.mock.calls.map((c) => ({
    url: String(c[0]),
    body: JSON.parse(c[1].body),
  }));
  expect(requests[0].body).toMatchObject({
    authorizationMode: "assumed",
    protocolVersion: "session-replay.v1",
  });
  expect(requests[0].body).not.toHaveProperty("qualityConsentId");
  const chunk = requests.find((r) => r.url.includes("/chunks/"))!;
  expect(chunk.body).toMatchObject({ encoding: "gzip-base64", surface: "bar" });
  expect(chunk.body).not.toHaveProperty("rawBytes");
  expect(fetch.mock.calls[0][1].headers["X-Installation-Id"]).toBe("owner");
});
it("explicit withdrawal stops synchronously, drops pending uploads and remains blocked after network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  await beginReplay("owner");
  await settleReplay();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const withdrawal = withdrawReplay();
  expect(replayActive()).toBe(false);
  await expect(withdrawal).rejects.toBeDefined();
  expect(await queueItems()).toEqual([]);
  safeStorage.removeItem("standin.replay.withdrawn.v1");
  await beginReplay("owner");
  expect(replayActive()).toBe(false);
});
it("production assumed and explicit false do not create or enqueue recordings", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("VITE_APP_ENV", "production");
  await beginReplay("owner");
  expect(replayActive()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("VITE_APP_ENV", "development");
  vi.stubEnv("VITE_REPLAY_ENABLED", "false");
  await beginReplay("owner");
  expect(await queueItems()).toEqual([]);
});

it("retries durable withdrawal on restart/online while disabled and never resumes recording", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await beginReplay("owner");
  await settleReplay();
  fetch.mockRejectedValue(new Error("offline"));
  await expect(withdrawReplay()).rejects.toBeDefined();
  expect(await pendingWithdrawal("owner")).toBe(true);
  // Simulate losing localStorage/process state: only the IDB control work survives.
  safeStorage.removeItem("standin.replay.withdrawn.v1");
  safeStorage.removeItem("standin.replay.withdrawal.pending.v1");
  stopReplay();
  vi.stubEnv("VITE_REPLAY_ENABLED", "false");
  fetch.mockClear();
  await beginReplay("owner"); // still offline
  expect(await pendingWithdrawal("owner")).toBe(true);
  fetch.mockResolvedValue(new Response("{}", { status: 200 }));
  fetch.mockClear();
  await Promise.all([flushReplay(), retryReplayWithdrawal("owner")]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  expect(fetch.mock.calls[0][1].headers["X-Installation-Id"]).toBe("owner");
  expect(await pendingWithdrawal("owner")).toBeUndefined();
  expect(replayActive()).toBe(false);
  vi.stubEnv("VITE_REPLAY_ENABLED", "true");
  await beginReplay("owner");
  expect(replayActive()).toBe(false);
  expect(await queueItems()).toEqual([]);
});

it("does not send an old owner's pending deletion under replacement credentials", async () => {
  await persistWithdrawal(true);
  await persistPendingWithdrawal("owner", true);
  setInstallationCredentials({ installationId: "replacement", deviceToken: "fixture-other" });
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await Promise.all([retryReplayWithdrawal("owner"), beginReplay("replacement")]);
  await flushReplay();
  expect(fetch).not.toHaveBeenCalled();
  expect(await pendingWithdrawal("owner")).toBe(true);
  setInstallationCredentials({ installationId: "owner", deviceToken: "fixture-not-a-real-token" });
  await retryReplayWithdrawal("owner");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await pendingWithdrawal("owner")).toBeUndefined();
});

it("preserves both offline bindings and their original expiry for identical image bytes", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await beginReplay("owner");
  await settleReplay();
  fetch.mockRejectedValue(new Error("offline"));
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
  const blob = new Blob([png], { type: "image/png" });
  Object.defineProperty(blob, "arrayBuffer", { value: async () => png.buffer });
  const early = new Date(Date.now() + 86400000).toISOString();
  await storeReplayAsset(blob, { kind: "rough", snapshotVersion: "first", sourceExpiresAt: early });
  await settleReplay();
  await storeReplayAsset(blob, { kind: "final", snapshotVersion: "second" });
  // Identical metadata retry must still be one queue item.
  await storeReplayAsset(blob, { snapshotVersion: "second", kind: "final" });
  const assets = (await queueItems()).filter((i) => i.path.includes("/assets/"));
  expect(assets).toHaveLength(2);
  expect(assets.map((i) => i.body)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "rough", snapshotVersion: "first", sourceExpiresAt: early }),
      expect.objectContaining({ kind: "final", snapshotVersion: "second" }),
    ]),
  );
  expect(new Set(assets.map((i) => i.path)).size).toBe(1);
});
