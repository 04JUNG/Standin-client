import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { interactiveHttp, checkOperation, type Operation } from "./http";
import { boundedBytes, BoundedQueue } from "./assets";
import { apiFetch, apiFetchResponse } from "@/shared/api/client";
vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn(), apiFetchResponse: vi.fn() }));
const target = { jobId: "job_fixture", personIndex: 0 };
const base = "/v1/analysis/jobs/job_fixture/people/0/interactive-state/op_test";
function op(): Operation {
  return {
    schemaVersion: "standin.interactive-http.v1",
    operationId: "op_test",
    candidateId: "candidate",
    revision: 2,
    stateHash: "b".repeat(64),
    selectionHash: "c".repeat(64),
    previewState: "authoritative",
    exportState: "ready",
    eventSequence: 5,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    fileUrl: base + "/file",
    modelUrl: base + "/model",
    posterUrl: null,
    errorCode: null,
    exportReceipt: null,
  };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(apiFetchResponse).mockReset();
  vi.mocked(apiFetch).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("rejects cross-operation, external and expired artifact references", () => {
  expect(() =>
    checkOperation({ ...op(), fileUrl: "https://external.invalid/file" }, target),
  ).toThrow();
  expect(() =>
    checkOperation({ ...op(), fileUrl: base.replace("op_test", "op_other") + "/file" }, target),
  ).toThrow();
  expect(() => checkOperation({ ...op(), expiresAt: new Date(0).toISOString() }, target)).toThrow();
});
it("downloads only a state/revision-bound verified file, checking real streamed bytes and digest", async () => {
  const data = new Uint8Array([1, 2, 3]);
  const hash = [...new Uint8Array(await webcrypto.subtle.digest("SHA-256", data))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const current = op();
  current.exportReceipt = {
    schema: "interactive-fbx-receipt-v1",
    operationId: current.operationId,
    revision: current.revision,
    stateHash: current.stateHash!,
    artifactSha256: hash,
    artifactBytes: 3,
    runtimeRevision: "d".repeat(64),
    packetModelSha256: "e".repeat(64),
    solverVersion: "chain-transport-v3.2.5",
    validationVersion: "final-fbx-v1",
    initialFbxRequired: true,
    nativeSaved: false,
  };
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": "3",
    "X-Standin-Artifact-Contract": "interactive-fbx-receipt-v1",
    "X-Standin-State-Hash": op().stateHash!,
    "X-Standin-Revision": "2",
    "X-Standin-Artifact-SHA256": hash,
  };
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(new Response(data, { headers }));
  const result = await interactiveHttp.file(target, current, new AbortController().signal);
  expect([...result.bytes]).toEqual([1, 2, 3]);
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(
    new Response(data, { headers: { ...headers, "X-Standin-Revision": "1" } }),
  );
  await expect(interactiveHttp.file(target, current, new AbortController().signal)).rejects.toThrow(
    "receipt changed",
  );
  vi.mocked(apiFetchResponse).mockResolvedValueOnce(
    new Response(new Uint8Array([1, 2, 4]), { headers }),
  );
  await expect(interactiveHttp.file(target, current, new AbortController().signal)).rejects.toThrow(
    "digest",
  );
});
it("bounds chunked allocation and cancels a queued task before it consumes a worker", async () => {
  await expect(
    boundedBytes(new Response(new Uint8Array(5)), 4, new AbortController().signal),
  ).rejects.toThrow("size");
  const queue = new BoundedQueue(1);
  let finish!: () => void;
  const first = queue.run(
    async () =>
      new Promise<void>((r) => {
        finish = r;
      }),
    new AbortController().signal,
  );
  const abort = new AbortController();
  const task = vi.fn(async () => 1),
    second = queue.run(task, abort.signal);
  const rejected = expect(second).rejects.toBeDefined();
  abort.abort();
  await rejected;
  finish();
  await first;
  expect(task).not.toHaveBeenCalled();
});

it("refuses a ready operation that drops its requested appearance proof", () => {
  const current = op();
  current.appearance = { version: "fbx-outline-v1", width: 1.2 };
  current.exportReceipt = {
    schema: "interactive-fbx-receipt-v1",
    operationId: current.operationId,
    revision: current.revision,
    stateHash: current.stateHash!,
    artifactSha256: "a".repeat(64),
    artifactBytes: 3,
    runtimeRevision: "d".repeat(64),
    packetModelSha256: "e".repeat(64),
    solverVersion: "chain-transport-v3.2.5",
    validationVersion: "final-fbx-v1",
    initialFbxRequired: true,
    nativeSaved: false,
  };
  expect(() => checkOperation(current, target)).toThrow("appearance receipt changed");
});

it("queries appearance-aware head and leaves missing or malformed capability unavailable", async () => {
  const response = {
    schemaVersion: "standin.interactive-http.v1",
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
  };
  vi.mocked(apiFetch).mockResolvedValueOnce(response);
  expect(
    (await interactiveHttp.head(target, "candidate", new AbortController().signal))
      .appearanceExport,
  ).toBeUndefined();
  vi.mocked(apiFetch).mockResolvedValueOnce({
    ...response,
    appearanceExport: { version: "fbx-outline-v1", available: "true" },
  });
  const appearance = { version: "fbx-outline-v1", width: 1.2 } as const;
  expect(
    (await interactiveHttp.head(target, "candidate", new AbortController().signal, appearance))
      .appearanceExport,
  ).toBeUndefined();
  const url = vi.mocked(apiFetch).mock.calls[1][0];
  expect(
    JSON.parse(new URL(url, "https://standin.invalid").searchParams.get("appearance")!),
  ).toEqual(appearance);
});
