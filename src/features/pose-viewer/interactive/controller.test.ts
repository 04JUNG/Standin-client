import { afterEach, expect, it, vi } from "vitest";
import { InteractiveController } from "./controller";
import { ApiError } from "@/shared/api/errors";
import { interactiveHttp, type InteractiveTransport, type Operation, type Prepare } from "./http";
import { forgetInteractiveJob, interactiveController } from "./session";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function verifiedGeometryHarness() {
  const { client, transport } = harness();
  let geometryHash = "d".repeat(64);
  let runtimeRevision = "e".repeat(64);
  const model = {
    packet: { stateHash: "b".repeat(64) },
    state: { identity: { selection: { candidate: "candidate" } } },
    frame: {},
  } as Awaited<ReturnType<InteractiveTransport["model"]>>;
  vi.mocked(transport.model).mockResolvedValue(model);
  vi.mocked(transport.head).mockResolvedValue({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    appearanceExport: { version: "fbx-outline-v1", available: true },
    skinExport: { version: "fbx-skin-v1", available: true, supportedIds: ["default", "flesh"] },
  });
  vi.mocked(transport.prepare).mockImplementation(async (_target, body) => ({
    ...operation(body),
    appearance: body.appearance,
    skin: body.skin,
  }));
  vi.mocked(transport.poll).mockImplementation(async (_target, op) => ({
    ...op,
    stateHash: "b".repeat(64),
    previewState: "authoritative",
    exportState: op.previewState === "solving" ? "not-requested" : "ready",
    eventSequence: op.eventSequence + 1,
    exportReceipt:
      op.previewState === "solving"
        ? null
        : {
            schema: "interactive-fbx-receipt-v1",
            operationId: op.operationId,
            revision: op.revision,
            stateHash: "b".repeat(64),
            artifactSha256: "c".repeat(64),
            artifactBytes: 2,
            runtimeRevision,
            packetModelSha256: geometryHash,
            solverVersion: "chain-transport-v3.2.5",
            validationVersion: "final-fbx-v1",
            initialFbxRequired: true,
            nativeSaved: false,
          },
  }));
  return {
    client,
    transport,
    model,
    changeRuntime: () => {
      runtimeRevision = "f".repeat(64);
    },
    changeGeometry: () => {
      geometryHash = "f".repeat(64);
    },
  };
}

it("keeps the displayed geometry across appearance invalidation and skips the packet only with a fresh matching receipt", async () => {
  vi.useFakeTimers();
  const { client, transport, model } = verifiedGeometryHarness();
  client.select("plain", "candidate", true, undefined, undefined, "base-a");
  await vi.advanceTimersByTimeAsync(290);
  expect(client.ready("plain")).toBe(true);
  expect(transport.model).toHaveBeenCalledOnce();
  client.invalidateAppearance();
  expect(client.snapshot().model).toBe(model);
  expect(client.snapshot().modelBinding).toBe("base-a");
  await expect(client.download("plain", new AbortController().signal)).rejects.toThrow();
  expect(transport.cancel).not.toHaveBeenCalled();
  client.select(
    "flesh",
    "candidate",
    true,
    undefined,
    { version: "fbx-skin-v1", id: "flesh" },
    "base-a",
  );
  await vi.advanceTimersByTimeAsync(290);
  expect(client.ready("flesh")).toBe(true);
  expect(transport.prepare).toHaveBeenCalledTimes(2); // A new file still needs current authority.
  expect(transport.export).toHaveBeenCalledTimes(2);
  expect(transport.model).toHaveBeenCalledOnce();
  expect(client.snapshot().model).toBe(model);
  client.dispose();
});

it("reloads geometry when the new receipt differs, and when hands/body change", async () => {
  vi.useFakeTimers();
  const { client, transport, changeGeometry } = verifiedGeometryHarness();
  client.select("plain", "candidate", true, undefined, undefined, "base-a");
  await vi.advanceTimersByTimeAsync(290);
  changeGeometry();
  client.invalidateAppearance();
  client.select(
    "outline",
    "candidate",
    true,
    { version: "fbx-outline-v1", width: 2 },
    undefined,
    "base-a",
  );
  await vi.advanceTimersByTimeAsync(290);
  expect(transport.model).toHaveBeenCalledTimes(2);
  client.select("hands", "candidate", true, undefined, undefined, "base-new-hands", "pose-a");
  expect(client.snapshot().model).toBeUndefined();
  await vi.advanceTimersByTimeAsync(290);
  expect(transport.model).toHaveBeenCalledTimes(3);
  client.dispose();
});

it("rechecks skin capability for a new valid choice after a previous unsupported choice", async () => {
  vi.useFakeTimers();
  const { client, transport } = verifiedGeometryHarness();
  vi.mocked(transport.head).mockResolvedValueOnce({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    skinExport: { version: "fbx-skin-v1", available: false, supportedIds: ["default"] },
  });
  client.select(
    "unsupported",
    "candidate",
    true,
    undefined,
    { version: "fbx-skin-v1", id: "gray-guide" },
    "base-a",
  );
  await vi.advanceTimersByTimeAsync(290);
  expect(client.snapshot().error).toBe(true);
  client.select(
    "flesh",
    "candidate",
    true,
    undefined,
    { version: "fbx-skin-v1", id: "flesh" },
    "base-a",
  );
  await vi.advanceTimersByTimeAsync(290);
  expect(transport.head).toHaveBeenCalledTimes(2);
  expect(client.ready("flesh")).toBe(true);
  client.dispose();
});

it("requires a new packet if runtime changes even when geometry SHA is unchanged", async () => {
  vi.useFakeTimers();
  const { client, transport, changeRuntime } = verifiedGeometryHarness();
  client.select("plain", "candidate", true, undefined, undefined, "base-a");
  await vi.advanceTimersByTimeAsync(290);
  changeRuntime();
  client.invalidateAppearance();
  client.select(
    "outline",
    "candidate",
    true,
    { version: "fbx-outline-v1", width: 2 },
    undefined,
    "base-a",
  );
  await vi.advanceTimersByTimeAsync(290);
  expect(transport.model).toHaveBeenCalledTimes(2);
  client.dispose();
});

it("keeps the accepted operation while polling returns 503 for 51 seconds", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const { client, transport } = harness();
  const recoverAt = Date.now() + 51_000;
  const normalPoll = vi.mocked(transport.poll).getMockImplementation()!;
  vi.mocked(transport.poll).mockImplementation(async (...args) => {
    if (Date.now() < recoverAt) throw new ApiError(503, "INTERACTIVE_UNAVAILABLE", "");
    return normalPoll(...args);
  });
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(50_000);
  expect(client.snapshot().error).toBe(false);
  expect(client.snapshot().operation?.operationId).toBe("op_1");
  expect(client.ready("one")).toBe(false);
  await vi.advanceTimersByTimeAsync(9_000);
  expect(client.ready("one")).toBe(true);
  expect(transport.prepare).toHaveBeenCalledOnce();
  expect(transport.cancel).not.toHaveBeenCalled();
  expect(vi.mocked(transport.poll).mock.calls.every(([, op]) => op.operationId === "op_1")).toBe(
    true,
  );
  client.dispose();
});

it("resumes the accepted head after retry exhaustion without creating another job", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.prepare).mockImplementation(async (_target, body) => ({
    ...operation(body),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }));
  const normalPoll = vi.mocked(transport.poll).getMockImplementation()!;
  vi.mocked(transport.poll).mockRejectedValue(new ApiError(503, "UNAVAILABLE", ""));
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(121_000);
  expect(client.snapshot().failure).toMatchObject({ code: "INTERACTIVE_POLL_TIMEOUT" });
  const accepted = client.snapshot().operation!;
  vi.mocked(transport.head).mockResolvedValueOnce({
    currentRevision: accepted.revision,
    currentStateHash: accepted.stateHash,
    operation: accepted,
  });
  vi.mocked(transport.poll).mockImplementation(normalPoll);
  client.retry();
  await vi.advanceTimersByTimeAsync(20);
  expect(client.ready("one")).toBe(true);
  expect(transport.prepare).toHaveBeenCalledOnce();
  expect(transport.cancel).not.toHaveBeenCalled();
  client.dispose();
});

it("waits through 180-second preparation with a late 503 and keeps the same operation", async () => {
  vi.useFakeTimers();
  const { transport } = harness();
  const client = new InteractiveController(
    { jobId: "job_test", personIndex: 0 },
    transport,
    250,
    1000,
  );
  const started = Date.now();
  vi.mocked(transport.prepare).mockImplementation(async (_target, body) => ({
    ...operation(body),
    expiresAt: new Date(started + 600_000).toISOString(),
  }));
  const normalPoll = vi.mocked(transport.poll).getMockImplementation()!;
  vi.mocked(transport.poll).mockImplementation(async (...args) => {
    const elapsed = Date.now() - started;
    if (elapsed >= 129_000 && elapsed < 180_000) throw new ApiError(503, "UNAVAILABLE", "");
    return elapsed < 180_000 ? args[1] : normalPoll(...args);
  });
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(179_000);
  expect(client.snapshot().error).toBe(false);
  expect(client.ready("one")).toBe(false);
  await vi.advanceTimersByTimeAsync(11_000);
  expect(client.ready("one")).toBe(true);
  expect(transport.prepare).toHaveBeenCalledOnce();
  client.dispose();
});

it("selection changes abort a retry without publishing the previous operation", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.poll).mockRejectedValue(new ApiError(503, "UNAVAILABLE", ""));
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(270);
  client.select("two", "candidate", false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(transport.poll).toHaveBeenCalledOnce();
  expect(client.snapshot().binding).toBe("two");
  expect(client.snapshot().error).toBe(false);
  expect(client.snapshot().operation).toBeUndefined();
  client.dispose();
});
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

it("refuses skin preparation on an older server without a skin capability", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  client.select("skin-flesh", "candidate", true, undefined, {
    version: "fbx-skin-v1",
    id: "flesh",
  });
  await vi.advanceTimersByTimeAsync(270);
  expect(transport.prepare).not.toHaveBeenCalled();
  expect(client.snapshot().failure).toMatchObject({ code: "SKIN_DISABLED" });
  expect(client.ready("skin-flesh")).toBe(false);
  client.invalidate();
});
it("keeps a same-base model for appearance changes while revoking download readiness, but drops it on body changes", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  const model = { packet: { stateHash: "b".repeat(64) }, frame: {} } as Awaited<
    ReturnType<InteractiveTransport["model"]>
  >;
  vi.mocked(transport.model).mockResolvedValue(model);
  client.select("plain", "candidate", true, undefined, undefined, "base-a");
  await vi.advanceTimersByTimeAsync(280);
  expect(client.snapshot().model).toBe(model);
  expect(client.ready("plain")).toBe(true);
  client.select(
    "outline",
    "candidate",
    false,
    { version: "fbx-outline-v1", width: 1 },
    undefined,
    "base-a",
  );
  expect(client.snapshot().model).toBe(model);
  expect(client.ready("outline")).toBe(false);
  expect(client.snapshot().operation).toBeUndefined();
  client.select("new-body", "candidate", false, undefined, undefined, "base-b");
  expect(client.snapshot().model).toBeUndefined();
  client.dispose();
});
it.each(["skin", "outline"] as const)(
  "retains the displayed model through a %s store change without reusing the old download",
  async (kind) => {
    vi.useFakeTimers();
    const { transport } = harness();
    vi.spyOn(interactiveHttp, "head").mockImplementation(transport.head);
    vi.spyOn(interactiveHttp, "prepare").mockImplementation(transport.prepare);
    vi.spyOn(interactiveHttp, "poll").mockImplementation(transport.poll);
    vi.spyOn(interactiveHttp, "cancel").mockImplementation(transport.cancel);
    const model = { packet: { stateHash: "b".repeat(64) }, frame: {} } as Awaited<
      ReturnType<InteractiveTransport["model"]>
    >;
    vi.spyOn(interactiveHttp, "model").mockResolvedValue(model);
    const file = vi.spyOn(interactiveHttp, "file").mockImplementation(transport.file);
    const job = "job_appearance_model";
    const old = usePoseSelectionStore.getState();
    usePoseSelectionStore.setState({
      serverJobId: job,
      selectedByPerson: { 0: "candidate" },
      skinByPerson: {},
      outlineByPerson: {},
      outlineEditingByPerson: {},
    });
    const client = interactiveController("owner", job, 0);
    try {
      client.select("plain", "candidate", true, undefined, undefined, "base-a");
      await vi.advanceTimersByTimeAsync(1300);
      expect(client.ready("plain")).toBe(true);
      const store = usePoseSelectionStore.getState();
      if (kind === "skin") store.setPersonSkin(0, "flesh");
      else store.setOutlineEditing(0, true);
      expect(client.ready("plain")).toBe(false);
      await expect(client.download("plain", new AbortController().signal)).rejects.toThrow(
        "current file unavailable",
      );
      expect(file).not.toHaveBeenCalled();
      client.select(
        kind,
        "candidate",
        false,
        kind === "outline" ? { version: "fbx-outline-v1", width: 1 } : undefined,
        kind === "skin" ? { version: "fbx-skin-v1", id: "flesh" } : undefined,
        "base-a",
      );
      expect(client.snapshot().model).toBe(model);
      expect(client.snapshot().operation).toBeUndefined();
      client.select("new-body", "candidate", false, undefined, undefined, "base-b");
      expect(client.snapshot().model).toBeUndefined();
    } finally {
      forgetInteractiveJob(job);
      usePoseSelectionStore.setState(old);
    }
  },
);
it("preserves a local hand draft only while the pose and body identity remain unchanged", () => {
  const { client } = harness();
  client.select("original", "candidate", false, undefined, undefined, "hands-a", "body-a");
  const surface = { body: {}, camera: {} } as Parameters<InteractiveController["localDraft"]>[0];
  client.localDraft(surface);
  client.select("edited-hand", "candidate", false, undefined, undefined, "hands-b", "body-a");
  expect(client.snapshot().localSurface).toBe(surface);
  client.select("edited-body", "candidate", false, undefined, undefined, "hands-b", "body-b");
  expect(client.snapshot().localSurface).toBeUndefined();
  client.dispose();
});

it("blocks an explicitly unavailable skin capability before prepare, polling or file access", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.head).mockResolvedValue({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    skinExport: { version: "fbx-skin-v1", available: false, supportedIds: ["default"] },
  });
  client.select("skin", "candidate", true, undefined, { version: "fbx-skin-v1", id: "gray-guide" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(client.snapshot()).toMatchObject({
    error: true,
    exportState: "failed",
    failure: { code: "SKIN_DISABLED" },
  });
  expect(transport.prepare).not.toHaveBeenCalled();
  expect(transport.poll).not.toHaveBeenCalled();
  expect(transport.export).not.toHaveBeenCalled();
  await expect(client.download("skin", new AbortController().signal)).rejects.toThrow(
    "current file unavailable",
  );
  expect(transport.file).not.toHaveBeenCalled();
  client.dispose();
});
it("preserves gray-guide at width 0.01 after prepare 400 without fallback, polling or file access", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  vi.mocked(transport.head).mockResolvedValue({
    currentRevision: 0,
    currentStateHash: null,
    operation: null,
    appearanceExport: { version: "fbx-outline-v1", available: true },
    skinExport: {
      version: "fbx-skin-v1",
      available: true,
      supportedIds: ["default", "gray-guide"],
    },
  });
  vi.mocked(transport.prepare).mockRejectedValue(new ApiError(400, "SKIN_UNSUPPORTED", ""));
  const appearance = { version: "fbx-outline-v1" as const, width: 0.01 };
  const skin = { version: "fbx-skin-v1" as const, id: "gray-guide" as const };
  client.select("skin-outline", "candidate", true, appearance, skin);
  await vi.advanceTimersByTimeAsync(1000);
  expect(transport.prepare).toHaveBeenCalledOnce();
  expect(vi.mocked(transport.prepare).mock.calls[0][1]).toMatchObject({ appearance, skin });
  expect(client.snapshot()).toMatchObject({
    error: true,
    exportState: "failed",
    failure: { status: 400, code: "SKIN_UNSUPPORTED" },
  });
  expect(transport.poll).not.toHaveBeenCalled();
  expect(transport.export).not.toHaveBeenCalled();
  await expect(client.download("skin-outline", new AbortController().signal)).rejects.toThrow(
    "current file unavailable",
  );
  expect(transport.file).not.toHaveBeenCalled();
  // An explicit retry clears the prior error while reusing the exact user selection.
  client.retry();
  expect(client.snapshot().failure).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1000);
  expect(transport.prepare).toHaveBeenCalledTimes(2);
  expect(vi.mocked(transport.prepare).mock.calls[1][1]).toEqual(
    vi.mocked(transport.prepare).mock.calls[0][1],
  );
  expect(client.snapshot().failure).toMatchObject({ code: "SKIN_UNSUPPORTED" });
  expect(transport.poll).not.toHaveBeenCalled();
  expect(transport.file).not.toHaveBeenCalled();
  client.dispose();
});

it("requests the hand atlas for v1 states but never for binary v2 states", async () => {
  vi.useFakeTimers();
  const atlas = () => ({
    table: {},
    surfaces: new Map(),
    bytes: 1,
    gpuBytes: 1,
    release: vi.fn(),
  });
  const model = (canonicalEncoding: string) =>
    ({ packet: { stateHash: "b".repeat(64), canonicalEncoding }, frame: {} }) as unknown as Awaited<
      ReturnType<InteractiveTransport["model"]>
    >;
  for (const [encoding, requested] of [
    ["typed-f64be-json-v1", 1],
    ["standin-binary-f64le-v2", 0],
  ] as const) {
    const { client, transport } = harness();
    transport.variants = vi.fn(async () => atlas());
    vi.mocked(transport.model).mockResolvedValue(model(encoding));
    client.select("one", "candidate", true);
    await vi.advanceTimersByTimeAsync(300);
    expect(client.ready("one")).toBe(true);
    expect(client.snapshot().model?.packet.canonicalEncoding).toBe(encoding);
    expect(client.snapshot().error).toBe(false);
    expect(transport.variants).toHaveBeenCalledTimes(requested);
    // No atlas means no local hand draft; the authoritative surface stays.
    expect(client.applyHands("left", null)).toBe(false);
    expect(client.snapshot().localSurface).toBeUndefined();
    client.dispose();
  }
});

it("keeps requesting the v1 atlas when the model download failed", async () => {
  vi.useFakeTimers();
  const { client, transport } = harness();
  transport.variants = vi.fn(async () => {
    throw new ApiError(409, "VARIANTS_UNAVAILABLE", "");
  });
  client.select("one", "candidate", true);
  await vi.advanceTimersByTimeAsync(300);
  expect(client.snapshot().modelError).toBe(true);
  expect(transport.variants).toHaveBeenCalledOnce();
  // An unavailable atlas is silent: the file stays ready and no error is published.
  expect(client.ready("one")).toBe(true);
  expect(client.snapshot().error).toBe(false);
  client.dispose();
});
