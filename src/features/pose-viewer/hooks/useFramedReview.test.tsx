import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { reviewedExportUrl, framedExportUrl } from "@/features/export/lib/framedExport";
const m = vi.hoisted(() => ({
  scope: "full",
  format: "fbx",
  refining: false,
  generated: false,
  available: true,
  ready: vi.fn(),
  image: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: m.ready }));
vi.mock("@/features/export/lib/preparedArtifact", async (original) => ({
  ...(await original<typeof import("@/features/export/lib/preparedArtifact")>()),
  loadPreparedImage: m.image,
}));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("@/features/hand-selection/hooks", () => ({
  useHands: () => ({ ready: true, entries: [], enabled: false, pending: false }),
}));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    refetch: m.reload,
    bodies: { enabled: false, entries: [], ready: true },
    data: {
      jobId: "job",
      capabilities: { fbxExport: m.available, outputScopeCropping: true },
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
    select({ characterId: null, characterByPerson: {} }),
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
    scope: "full",
    format: "fbx",
    refining: false,
    generated: false,
    available: true,
  });
  m.ready.mockReset().mockImplementation(async (url: string) => ready(url));
  m.image.mockReset().mockResolvedValue("final-image");
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
