import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { env } from "@/shared/lib/env";
import { ApiError } from "@/shared/api/errors";
import type { InteractiveSnapshot } from "../interactive/controller";
import type { useInteractiveReviews } from "../interactive/useInteractiveReviews";
import { SKIN_CHOICES, type SkinId } from "../skin/skinChoices";
import { reviewedExportUrl, framedExportUrl } from "@/features/export/lib/framedExport";
const m = vi.hoisted(() => ({
  skin: "default" as SkinId,
  handRevision: 0,
  finalCapability: false,
  snapshot: undefined as Partial<InteractiveSnapshot> | undefined,
  staleSnapshot: false,
  outline: 0,
  interactive: vi.fn(),
  scope: "full",
  format: "fbx",
  refining: false,
  generated: false,
  available: true,
  local: false,
  model: vi.fn(),
  ready: vi.fn(),
  image: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("../interactive/useInteractiveReviews", () => ({
  useInteractiveReviews: (options: Parameters<typeof useInteractiveReviews>[0]) => {
    m.interactive(options);
    const snapshots = m.snapshot
      ? [
          {
            binding: m.staleSnapshot ? "previous-selection" : options.requests[0]?.binding,
            previewState: "solving",
            exportState: "not-requested",
            ...m.snapshot,
          },
        ]
      : [];
    return {
      controllers: [],
      snapshots,
      ready: false,
      failed: snapshots.some(
        (s) => !m.staleSnapshot && (s.error || s.failure || s.exportState === "failed"),
      ),
      retry: vi.fn(),
    };
  },
}));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: m.ready }));
vi.mock("@/features/export/lib/preparedArtifact", async (original) => ({
  ...(await original<typeof import("@/features/export/lib/preparedArtifact")>()),
  loadPreparedImage: m.image,
}));
vi.mock("@/features/export/lib/preparedFbx", () => ({ loadPreparedFbx: m.model }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("@/features/hand-selection/hooks", () => ({
  useHands: () => ({
    ready: true,
    entries: m.handRevision ? [{ personIndex: 0, selection: { revision: m.handRevision } }] : [],
    enabled: false,
    pending: false,
  }),
}));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    refetch: m.reload,
    bodies: { enabled: false, entries: [], ready: true },
    data: {
      jobId: "job",
      capabilities: {
        fbxExport: m.available,
        outputScopeCropping: true,
        ...(m.finalCapability
          ? {
              interactiveState: {
                schemaVersion: "standin.interactive-http.v1",
                available: true,
                transport: "polling",
                localHands: false,
                initialFbxRequired: true,
              },
            }
          : {}),
      },
      people: [
        {
          index: 0,
          outputScope: {
            selection: m.scope,
            resolved: m.scope,
            detected: m.scope,
            detectionSource: "vlm_person",
            resolutionSource: "user",
          },
        },
      ],
    },
    items: [
      {
        personIndex: 0,
        candidate: {
          id: "pick",
          source: m.generated ? "generation" : "library",
          sourceBvhSha256: "a".repeat(64),
        },
        exportUrl: "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=pick",
        previewUrl: "reference",
        refined: false,
      },
    ],
    isRefining: m.refining,
  }),
}));
vi.mock("@/features/export/store/exportStore", () => ({ useExportStore: () => m.format }));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("../store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({
      characterId: null,
      characterByPerson: {},
      skinByPerson: { 0: m.skin },
      outlineByPerson: { 0: m.outline },
    }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: { defaultCharacterId: "master", characters: [] },
    isSuccess: true,
  }),
}));
import { useFramedReview } from "./useFramedReview";
function ready(url: string, key = "b".repeat(64)) {
  const scope = new URL(url, "https://standin.invalid").searchParams.get("outputScope")!;
  return new Response(null, {
    headers: {
      ...(m.local ? { "X-Standin-Local-Preview": "fbx-v1" } : {}),
      "X-Standin-Artifact-Contract": "verified-fbx-v1",
      "X-Standin-Review-Key": key,
      "X-Standin-Artifact-SHA256": "c".repeat(64),
      "X-Standin-Character-SHA256": "d".repeat(64),
      "X-Standin-Source-BVH-SHA256": "a".repeat(64),
      "X-Standin-Output-Scope": scope,
    },
  });
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, qc };
}
beforeEach(() => {
  Object.assign(m, {
    skin: "default",
    handRevision: 0,
    finalCapability: false,
    snapshot: undefined,
    staleSnapshot: false,
    outline: 0,
    scope: "full",
    format: "fbx",
    refining: false,
    generated: false,
    available: true,
    local: false,
  });
  m.interactive.mockClear();
  m.model.mockReset().mockResolvedValue(new ArrayBuffer(32));
  m.ready.mockReset().mockImplementation(async (url: string) => ready(url));
  m.image.mockReset().mockResolvedValue("final-image");
});
it("keeps pose/base identities on appearance edits and includes hand selection in the file identity", async () => {
  m.finalCapability = true;
  const hook = mount();
  const request = () => m.interactive.mock.lastCall![0].requests[0];
  const original = { ...request() };
  m.skin = "flesh";
  hook.rerender();
  expect(request().binding).not.toBe(original.binding);
  expect(request().baseBinding).toBe(original.baseBinding);
  expect(request().poseBinding).toBe(original.poseBinding);
  m.outline = 2;
  hook.rerender();
  expect(request().baseBinding).toBe(original.baseBinding);
  const appearanceBinding = request().binding;
  m.handRevision = 1;
  hook.rerender();
  expect(request().binding).not.toBe(appearanceBinding);
  expect(request().baseBinding).not.toBe(original.baseBinding);
  expect(request().poseBinding).toBe(original.poseBinding);
  hook.unmount();
});
it("permits download before image completion and never downloads automatically", async () => {
  m.image.mockImplementation(() => new Promise(() => {}));
  const { result } = mount();
  expect(result.current.downloadReady).toBe(false);
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  expect(result.current.previewLoading).toBe(true);
  expect(m.ready.mock.calls[0]![0]).toContain("format=ready");
  expect(m.ready.mock.calls.every(([url]) => !url.includes("format=fbx"))).toBe(true);
});
it("an image-only failure keeps verified download available", async () => {
  m.image.mockRejectedValue(new Error("PNG failed"));
  const { result } = mount();
  await waitFor(() => expect(result.current.previewError).toBe(true));
  expect(result.current.downloadReady).toBe(true);
  expect(result.current.preparationError).toBe(false);
});
it("FBX validation failure blocks download and schedules no image", async () => {
  m.ready.mockRejectedValue(new Error("FBX verification failed"));
  const { result } = mount();
  await waitFor(() => expect(result.current.preparationError).toBe(true));
  expect(result.current.downloadReady).toBe(false);
  expect(result.current.previewLoading).toBe(false);
  expect(result.current.previewError).toBe(true);
  expect(result.current.preparationNotice).not.toContain("준비하고");
  expect(m.image).not.toHaveBeenCalled();
});
it("A → B → C cancels obsolete requests and ignores out-of-order transports", async () => {
  const calls: { url: string; signal: AbortSignal; finish: (r: Response) => void }[] = [];
  m.ready.mockImplementation(
    (url: string, { signal }: { signal: AbortSignal }) =>
      new Promise<Response>((finish) => calls.push({ url, signal, finish })),
  );
  const { result, rerender } = mount();
  await waitFor(() => expect(calls.length).toBe(1));
  m.scope = "half";
  rerender();
  expect(result.current.downloadReady).toBe(false);
  await waitFor(() => expect(calls.length).toBe(2));
  m.scope = "bust";
  rerender();
  await waitFor(() => expect(calls.length).toBe(3));
  expect(calls[0]!.signal.aborted).toBe(true);
  expect(calls[1]!.signal.aborted).toBe(true);
  await act(async () => calls[2]!.finish(ready(calls[2]!.url, "e".repeat(64))));
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  await act(async () => {
    calls[1]!.finish(ready(calls[1]!.url));
    calls[0]!.finish(ready(calls[0]!.url));
  });
  expect(result.current.items[0]?.scopeLabel).toBe("흉상");
  const url = framedExportUrl(
    "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=pick",
    "bust",
    "fbx",
    null,
  );
  expect(reviewedExportUrl(url, url + "#false")).toContain("artifactReceipt=" + "e".repeat(64));
});
it("returning to the same confirmed selection reuses the prepared artifact cache", async () => {
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  m.scope = "head";
  rerender();
  expect(result.current.downloadReady).toBe(false);
  await waitFor(() => expect(m.ready).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  m.scope = "full";
  rerender();
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  expect(m.ready).toHaveBeenCalledTimes(2);
});
it("waits for refine before preparing the final selection", async () => {
  m.refining = true;
  const { result, rerender } = mount();
  expect(m.ready).not.toHaveBeenCalled();
  expect(result.current.downloadReady).toBe(false);
  m.refining = false;
  rerender();
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
});
it("preserves BVH reference behavior without final-FBX work", () => {
  m.format = "bvh";
  const { result } = mount();
  expect(result.current.items[0]?.previewUrl).toBe("reference");
  expect(m.ready).not.toHaveBeenCalled();
  expect(result.current.downloadReady).toBe(true);
});
it("generated poses still require FBX and converter readiness", () => {
  m.generated = true;
  m.available = false;
  const { result } = mount();
  expect(result.current.downloadReady).toBe(false);
  expect(result.current.preparationError).toBe(true);
});

it("shows the final file in 3D without PNG work and keeps download independent of model loading", async () => {
  m.local = true;
  let finish!: (data: ArrayBuffer) => void;
  m.model.mockImplementation(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = mount();
  await waitFor(() => expect(m.model).toHaveBeenCalledTimes(1));
  expect(result.current.downloadReady).toBe(true);
  expect(result.current.previewLoading).toBe(true);
  expect(m.image).not.toHaveBeenCalled();
  await act(async () => finish(new ArrayBuffer(32)));
  await waitFor(() => expect(result.current.items[0]?.previewModel?.format).toBe("fbx"));
  expect(result.current.previewLoading).toBe(false);
  expect(m.image).not.toHaveBeenCalled();
});
it.each(["fetch", "render"])(
  "requests the exact-file PNG only after a 3D %s failure",
  async (failure) => {
    m.local = true;
    if (failure === "fetch") m.model.mockRejectedValue(new Error("unsupported file"));
    const { result } = mount();
    if (failure === "render") {
      await waitFor(() => expect(result.current.items[0]?.previewModel).toBeTruthy());
      expect(m.image).not.toHaveBeenCalled();
      act(() => result.current.items[0]!.onModelStatus("failed"));
    }
    await waitFor(() => expect(result.current.items[0]?.previewUrl).toBe("final-image"));
    expect(result.current.items[0]?.previewModel).toBeUndefined();
    expect(result.current.downloadReady).toBe(true);
  },
);
it("rejects a late model after output scope changes", async () => {
  m.local = true;
  const calls: { signal: AbortSignal; finish: (data: ArrayBuffer) => void }[] = [];
  m.model.mockImplementation(
    (_url, _file, signal: AbortSignal) =>
      new Promise<ArrayBuffer>((finish) => calls.push({ signal, finish })),
  );
  const { result, rerender } = mount();
  await waitFor(() => expect(calls.length).toBe(1));
  m.scope = "head";
  rerender();
  expect(result.current.items[0]?.previewModel).toBeUndefined();
  await waitFor(() => expect(calls.length).toBe(2));
  expect(calls[0]!.signal.aborted).toBe(true);
  await act(async () => calls[0]!.finish(new ArrayBuffer(32)));
  expect(result.current.items[0]?.previewModel).toBeUndefined();
  await act(async () => calls[1]!.finish(new ArrayBuffer(64)));
  await waitFor(() => expect(result.current.items[0]?.previewModel?.data.byteLength).toBe(64));
  expect(result.current.items[0]?.scopeLabel).toBe("두상");
});

it("unsupported flesh preparation stops the spinner and exposes a retryable failure", async () => {
  m.skin = "flesh";
  const { result } = mount();
  await waitFor(() => expect(result.current.preparationError).toBe(true));
  expect(result.current.downloadReady).toBe(false);
  expect(result.current.previewLoading).toBe(false);
  expect(result.current.previewError).toBe(true);
  expect(result.current.preparationNotice).toBe("파일을 준비하지 못했어요. 다시 시도해 주세요.");
  expect(m.image).not.toHaveBeenCalled();
});

it.each(SKIN_CHOICES)(
  "routes $label through final interactive operations without Top5 assets",
  ({ id }) => {
    const previous = env.interactivePreview;
    Object.defineProperty(env, "interactivePreview", { value: true, configurable: true });
    try {
      m.finalCapability = true;
      m.skin = id;
      const { result, unmount } = mount();
      const options = m.interactive.mock.lastCall?.[0];
      expect(options.enabled).toBe(true);
      expect(options.requests[0].skin).toEqual(
        id === "default" ? undefined : { version: "fbx-skin-v1", id },
      );
      expect(result.current.preparationError).toBe(false);
      expect(result.current.items[0].interactivePreview).toBeDefined();
      expect(result.current.items[0].interactivePreview?.asset).toBeUndefined();
      expect(m.ready).not.toHaveBeenCalled();
      unmount();
    } finally {
      Object.defineProperty(env, "interactivePreview", { value: previous, configurable: true });
    }
  },
);

it.each([
  {
    name: "head rejects skin availability",
    snapshot: { error: true, failure: new ApiError(503, "SKIN_DISABLED", "server detail") },
  },
  {
    name: "prepare rejects gray-guide at width 0.01",
    snapshot: {
      error: true,
      failure: new ApiError(400, "SKIN_UNSUPPORTED", "server detail"),
      exportState: "failed" as const,
    },
  },
  {
    name: "failure without error flag",
    snapshot: { failure: new ApiError(400, "SKIN_UNSUPPORTED", "server detail") },
  },
  { name: "export fails without an error code", snapshot: { exportState: "failed" as const } },
])("shows recovery inside the card when $name", ({ snapshot }) => {
  const previous = env.interactivePreview;
  Object.defineProperty(env, "interactivePreview", { value: true, configurable: true });
  try {
    m.finalCapability = true;
    m.skin = "gray-guide";
    m.outline = 0.01;
    m.snapshot = snapshot;
    const { result, rerender, unmount } = mount();
    const preview = result.current.items[0].interactivePreview!;
    expect(preview.failed).toBe(true);
    expect(preview.notice).not.toContain("준비 중");
    expect(preview.notice).not.toContain("server detail");
    expect(preview.notice).toBe(result.current.previewFailure.message);
    expect(result.current.preparationNotice).toBe(preview.notice);
    if (snapshot.failure?.code === "SKIN_UNSUPPORTED")
      expect(preview.notice).toContain("외곽선 0 또는 2");
    expect(result.current.preparationLoading).toBe(false);
    expect(result.current.previewLoading).toBe(false);
    expect(result.current.previewError).toBe(true);
    expect(result.current.downloadReady).toBe(false);
    expect(result.current.requestDownload()).toBe(false);
    expect(m.ready).not.toHaveBeenCalled();
    expect(m.image).not.toHaveBeenCalled();
    expect(m.interactive.mock.lastCall?.[0].requests[0]).toMatchObject({
      skin: { version: "fbx-skin-v1", id: "gray-guide" },
      appearance: { version: "fbx-outline-v1", width: 0.01 },
    });
    m.staleSnapshot = true;
    rerender();
    expect(result.current.items[0].interactivePreview?.failed).toBe(false);
    expect(result.current.previewError).toBe(false);
    unmount();
  } finally {
    Object.defineProperty(env, "interactivePreview", { value: previous, configurable: true });
  }
});
