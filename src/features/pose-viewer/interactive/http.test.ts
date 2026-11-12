import { previewFixture } from "../skin/__fixtures__/skinPreview";
import { skinPreviewSchema } from "../skin/skinPreview";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interactiveHttp, checkOperation, type Operation } from "./http";
import v1Fixture from "./__fixtures__/converter-packet.json";
import v2Fixture from "./__fixtures__/converter-packet-v2.json";
import { joinState, sha256, splitState, stateBytes } from "./__fixtures__/binaryState";
import { ENCODING, MEDIA_TYPE } from "./shared/interactive_pose_v2.mjs";
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

it("keeps the skin unavailable reason only beside an unavailable capability", async () => {
  const response = {
    schemaVersion: "standin.interactive-http.v1",
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    skinExport: { version: "fbx-skin-v1", available: false, supportedIds: ["default"] },
  };
  const head = async (extra: Record<string, unknown>) => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...response, ...extra });
    return interactiveHttp.head(target, "candidate", new AbortController().signal);
  };
  expect(
    (await head({ skinUnavailable: { code: "SKIN_UNSUPPORTED", outputScope: "half" } }))
      .skinUnavailable,
  ).toEqual({ code: "SKIN_UNSUPPORTED", outputScope: "half" });
  // Older servers: no reason. Malformed reasons are ignored, never trusted.
  expect((await head({})).skinUnavailable).toBeUndefined();
  expect((await head({ skinUnavailable: { code: "rm -rf" } })).skinUnavailable).toBeUndefined();
  expect(
    (await head({ skinUnavailable: { code: "SKIN_UNSUPPORTED", outputScope: "knees" } }))
      .skinUnavailable,
  ).toBeUndefined();
  // A reason never qualifies an available capability.
  const available = await head({
    skinExport: { version: "fbx-skin-v1", available: true, supportedIds: ["default", "flesh"] },
    skinUnavailable: { code: "SKIN_UNSUPPORTED", outputScope: "half" },
  });
  expect(available.skinExport?.available).toBe(true);
  expect(available.skinUnavailable).toBeUndefined();
});

it("cannot accept a selected skin with a legacy untextured file receipt", () => {
  const current = op();
  current.skin = { version: "fbx-skin-v1", id: "flesh" };
  current.skinPreview = skinPreviewSchema.parse(previewFixture());
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

describe("solved state /model encodings", () => {
  const modelOp = (stateHash: string, revision = 1): Operation => ({
    ...op(),
    operationId: "op_fixture",
    revision,
    stateHash,
    exportState: "not-requested",
    fileUrl: null,
    modelUrl: "/v1/analysis/jobs/job_fixture/people/0/interactive-state/op_fixture/model",
  });
  const serve = (body: BodyInit, contentType: string, stateHash: string, revision = "1") =>
    vi.mocked(apiFetchResponse).mockResolvedValueOnce(
      new Response(body, {
        headers: {
          "Content-Type": contentType,
          "X-Standin-State-Hash": stateHash,
          "X-Standin-Revision": revision,
        },
      }),
    );
  const load = (current: Operation, candidateId = "candidate") =>
    interactiveHttp.model(target, current, candidateId, new AbortController().signal);

  it("reads raw v2 bytes by media type without retaining a canonical string", async () => {
    const hash = v2Fixture.packet.stateHash;
    serve(stateBytes(v2Fixture), MEDIA_TYPE, hash);
    const result = await load(modelOp(hash));
    expect(result.packet).toMatchObject({
      operation: "op_fixture",
      revision: 1,
      stateHash: hash,
      canonicalEncoding: ENCODING,
      modelSha256: v2Fixture.packet.modelSha256,
    });
    expect(result.packet).not.toHaveProperty("canonicalState");
    expect(result.state.model.meshes[0].triangles).toBeInstanceOf(Uint32Array);
    expect(result.state.identity.selection).toEqual({
      operation: "op_fixture",
      revision: 1,
      person: "0",
      candidate: "candidate",
    });
    expect(result.frame).toBeUndefined();
    expect(vi.mocked(apiFetchResponse).mock.calls[0][0]).toBe(modelOp(hash).modelUrl);
  });

  it("keeps the v1 JSON envelope path unchanged", async () => {
    const hash = v1Fixture.packet.stateHash;
    serve(
      JSON.stringify(v1Fixture.packet),
      "application/vnd.standin.solved-pose-state-v1+json",
      hash,
    );
    const result = await load(modelOp(hash));
    expect(result.packet.canonicalEncoding).toBe("typed-f64be-json-v1");
    expect(Array.isArray(result.state.model.meshes[0].triangles)).toBe(true);
  });

  it("adds the fixed converter frame for v2 bytes from the canonical-snapshot adapter", async () => {
    const { stateHeader, modelHeader, body } = splitState(stateBytes(v2Fixture));
    (stateHeader.identity as { solver: { adapterVersion: string } }).solver.adapterVersion =
      "post-frozen-file-canonical-snapshot-v2";
    const bytes = joinState(stateHeader, modelHeader, body);
    const hash = await sha256(bytes);
    serve(bytes, `${MEDIA_TYPE}; charset=binary`, hash);
    const result = await load(modelOp(hash));
    expect(result.frame).toEqual({
      target: [0, 0, 0],
      referenceAspect: 1,
      projectionIncludesCenterScaleCrop: true,
    });
  });

  it("refuses wrong media types, changed headers, tampered bytes and stale selections", async () => {
    const hash = v2Fixture.packet.stateHash,
      bytes = stateBytes(v2Fixture);
    serve(bytes, "application/octet-stream", hash);
    await expect(load(modelOp(hash))).rejects.toThrow("invalid packet type");
    // v2 bytes labelled as the v1 envelope are never decoded as binary.
    serve(bytes, "application/vnd.standin.solved-pose-state-v1+json", hash);
    await expect(load(modelOp(hash))).rejects.toThrow();
    serve(bytes, MEDIA_TYPE, hash, "2");
    await expect(load(modelOp(hash))).rejects.toThrow("packet headers changed");
    serve(bytes, MEDIA_TYPE, "a".repeat(64));
    await expect(load(modelOp(hash))).rejects.toThrow("packet headers changed");
    const flipped = bytes.slice();
    flipped[flipped.length - 1] ^= 1;
    serve(flipped, MEDIA_TYPE, hash);
    await expect(load(modelOp(hash))).rejects.toThrow("state hash mismatch");
    // Headers and hash agree with the operation, but the state belongs to another selection.
    serve(bytes, MEDIA_TYPE, hash, "2");
    await expect(load(modelOp(hash, 2))).rejects.toThrow("solved selection mismatch");
    serve(bytes, MEDIA_TYPE, hash);
    await expect(load({ ...modelOp(hash), operationId: "op_other" })).rejects.toThrow(
      "solved selection mismatch",
    );
    serve(bytes, MEDIA_TYPE, hash);
    await expect(load(modelOp(hash), "other")).rejects.toThrow("solved selection mismatch");
  });
});
