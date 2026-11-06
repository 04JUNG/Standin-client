import { afterEach, expect, it, vi } from "vitest";
import { InteractiveController } from "./controller";
import type { InteractiveTransport, Operation, Prepare } from "./http";
function operation(body: Prepare): Operation {
  return {
    schemaVersion: "standin.interactive-http.v1",
    operationId: `op_${body.revision}`,
    candidateId: body.candidateId,
    revision: body.revision,
    selectionHash: "a".repeat(64),
    stateHash: null,
    previewState: "solving",
    exportState: "not-requested",
    eventSequence: 1,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    modelUrl: null,
    fileUrl: null,
    posterUrl: null,
    errorCode: null,
    exportReceipt: null,
  };
}
function harness() {
  const transport: InteractiveTransport = {
    head: vi.fn(async () => ({ currentRevision: 0, currentStateHash: null, operation: null })),
    prepare: vi.fn(async (_target, body) => operation(body)),
    poll: vi.fn(async (_target, op) => ({
      ...op,
      stateHash: "b".repeat(64),
      previewState: "authoritative",
      exportState: "ready",
      eventSequence: op.eventSequence + 1,
      fileUrl: "/v1/file",
    })),
    cancel: vi.fn(async () => {}),
    export: vi.fn(async (_target, op) => ({
      ...op,
      exportState: "queued",
      eventSequence: op.eventSequence + 1,
    })),
    model: vi.fn(async () => {
      throw Error("GPU/packet failed");
    }),
    file: vi.fn(async (_target, op) => ({
      bytes: new Uint8Array([1, 2]),
      receipt: {
        stateHash: op.stateHash!,
        revision: op.revision,
        operation: op.operationId,
        artifactSha256: "c".repeat(64),
        artifactBytes: 2,
      },
    })),
  };
  return {
    transport,
    client: new InteractiveController({ jobId: "job_test", personIndex: 0 }, transport, 250, 10),
  };
}
afterEach(() => vi.useRealTimers());
it("debounces server preparation only, invalidates old-ready immediately, and keeps file ready despite a model failure", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  client.select("hands-1", "candidate", true);
  client.select("hands-2", "candidate", true);
  client.select("hands-3", "candidate", true);
  expect(client.ready("hands-3")).toBe(false);
  await vi.advanceTimersByTimeAsync(270);
  expect(transport.prepare).toHaveBeenCalledTimes(1);
  expect(client.ready("hands-3")).toBe(true);
  expect(client.snapshot().modelError).toBe(true);
  client.select("hands-4", "candidate", false);
  expect(client.ready("hands-3")).toBe(false);
  expect(client.snapshot().exportState).toBe("superseded");
  client.invalidate();
});
it("serializes creates, cancels a late operation and uses the learned revision for the latest CAS", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  let complete!: (op: Operation) => void;
  let first!: Prepare;
  vi.mocked(transport.prepare).mockImplementationOnce(async (_target, body) => {
    first = body;
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(250);
  client.select("two", "candidate", true);
  await vi.advanceTimersByTimeAsync(250);
  complete(operation(first));
  await vi.advanceTimersByTimeAsync(30);
  expect(transport.cancel).toHaveBeenCalled();
  expect(vi.mocked(transport.prepare).mock.calls[1][1].expectedRevision).toBe(1);
  expect(client.ready("two")).toBe(true);
  client.invalidate();
});
it("rejects a downloaded old file if hands/refine/shape changes while bytes are in flight", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(270);
  let done!: (result: Awaited<ReturnType<InteractiveTransport["file"]>>) => void;
  vi.mocked(transport.file).mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const op = client.snapshot().operation!;
  const download = client.download("one", new AbortController().signal);
  const assertion = expect(download).rejects.toThrow("superseded");
  client.select("two", "candidate", false);
  done({
    bytes: new Uint8Array([1]),
    receipt: {
      stateHash: op.stateHash!,
      revision: op.revision,
      operation: op.operationId,
      artifactSha256: "c".repeat(64),
      artifactBytes: 1,
    },
  });
  await assertion;
  client.invalidate();
});
it("retries uncertain POST using identical revision and mutation id", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.prepare).mockRejectedValueOnce(Error("lost reply"));
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(260);
  client.retry();
  await vi.advanceTimersByTimeAsync(20);
  expect(vi.mocked(transport.prepare).mock.calls[1][1]).toEqual(
    vi.mocked(transport.prepare).mock.calls[0][1],
  );
  client.invalidate();
});

it("bounds prepared hand atlases across people and releases them on disposal", () => {
  const controllers = Array.from(
    { length: 4 },
    (_, personIndex) => new InteractiveController({ jobId: "job-budget", personIndex }),
  );
  const releases = controllers.map(() => vi.fn());
  controllers.forEach((controller, i) =>
    controller.installHandAtlas({
      table: {},
      surfaces: new Map(),
      bytes: 8 * 1024 * 1024,
      gpuBytes: 8 * 1024 * 1024,
      release: releases[i],
    }),
  );
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases.slice(1).every((release) => release.mock.calls.length === 0)).toBe(true);
  controllers.forEach((controller) => controller.dispose());
  expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
});

it("revokes ready after upstream artifact expiry and recovers a fresh operation on retry", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(270);
  const previous = client.snapshot().operation!;
  vi.mocked(transport.file).mockRejectedValueOnce({ code: "INTERACTIVE_EXPIRED" });
  await expect(client.download("one", new AbortController().signal)).rejects.toEqual({
    code: "INTERACTIVE_EXPIRED",
  });
  expect(client.ready("one")).toBe(false);
  expect(client.snapshot().exportState).toBe("failed");
  vi.mocked(transport.head).mockResolvedValueOnce({
    currentRevision: previous.revision,
    currentStateHash: previous.stateHash,
    operation: null,
  });
  client.retry();
  await vi.advanceTimersByTimeAsync(20);
  expect(vi.mocked(transport.prepare).mock.calls[1][1].expectedRevision).toBe(previous.revision);
  expect(client.snapshot().operation?.revision).toBe(previous.revision + 1);
  expect(client.ready("one")).toBe(true);
  client.dispose();
});

it("does not prepare while a width gesture is in progress and sends only the final logical appearance", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.head).mockResolvedValue({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    appearanceExport: { version: "fbx-outline-v1", available: true },
  });
  vi.mocked(transport.prepare).mockImplementation(async (_target, body) => ({
    ...operation(body),
    appearance: body.appearance,
  }));
  client.select("zero", "candidate", true);
  await vi.advanceTimersByTimeAsync(270);
  expect(vi.mocked(transport.prepare).mock.calls[0][1]).not.toHaveProperty("appearance");
  client.select("thin", "candidate", false, { version: "fbx-outline-v1", width: 0.65 });
  client.select("mid", "candidate", false, { version: "fbx-outline-v1", width: 1.2 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(transport.prepare).toHaveBeenCalledTimes(1);
  expect(client.ready("zero")).toBe(false);
  client.select("max", "candidate", true, { version: "fbx-outline-v1", width: 2 });
  await vi.advanceTimersByTimeAsync(270);
  expect(transport.prepare).toHaveBeenCalledTimes(2);
  expect(vi.mocked(transport.prepare).mock.calls[1][1].appearance).toEqual({
    version: "fbx-outline-v1",
    width: 2,
  });
  client.dispose();
});
it("old servers and disabled capability cannot prepare a nonzero file", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  client.select("outlined", "candidate", true, { version: "fbx-outline-v1", width: 1 });
  await vi.advanceTimersByTimeAsync(270);
  expect(transport.prepare).not.toHaveBeenCalled();
  expect(client.snapshot().failure).toMatchObject({ code: "OUTLINE_DISABLED" });
  expect(client.ready("outlined")).toBe(false);
  client.dispose();
});
it("an old width acknowledgement cannot satisfy a new width even with matching revision", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.head).mockResolvedValue({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    appearanceExport: { version: "fbx-outline-v1", available: true },
  });
  client.select("max", "candidate", true, { version: "fbx-outline-v1", width: 2 });
  await vi.advanceTimersByTimeAsync(270);
  expect(client.ready("max")).toBe(false);
  expect(transport.file).not.toHaveBeenCalled();
  expect(client.snapshot().exportState).toBe("failed");
  client.dispose();
});
