import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const { state, fetchBlob } = vi.hoisted(() => ({
  state: {
    enabled: true,
    refining: false,
    scope: "half",
    format: "fbx",
    catalogError: false,
  },
  fetchBlob: vi.fn(),
}));
vi.mock("@/shared/api/client", () => ({ apiFetchBlob: fetchBlob }));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    data: {
      capabilities: {
        fbxExport: true,
        outputScopeCropping: state.enabled,
        characterSelection: false,
      },
      people: [
        {
          index: 0,
          outputScope: {
            selection: state.scope,
            detected: "half",
            detectionSource: "vlm_person",
            resolved: state.scope,
            resolutionSource: "user",
          },
        },
      ],
    },
    items: [
      {
        personIndex: 0,
        candidate: { id: "p" },
        exportUrl: "/v1/pose-candidates/p/export?jobId=j&personIndex=0&candidateId=p",
        previewUrl: "FULL_BODY",
        refined: false,
      },
    ],
    isRefining: state.refining,
  }),
}));
vi.mock("@/features/export/store/exportStore", () => ({ useExportStore: () => state.format }));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("../store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({ characterId: null, characterByPerson: {} }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: { defaultCharacterId: "master", characters: [] },
    isPending: false,
    isError: state.catalogError,
    isSuccess: !state.catalogError,
    refetch: vi.fn(),
  }),
}));
const { useFramedReview } = await import("./useFramedReview");
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
describe("framed review", () => {
  beforeEach(() => {
    Object.assign(state, {
      enabled: true,
      refining: false,
      scope: "half",
      format: "fbx",
      catalogError: false,
    });
    fetchBlob.mockReset();
    fetchBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  });
  it("uses actual scoped output and switches scopes without showing stale full image", async () => {
    const { result, rerender } = mount();
    expect(result.current.items[0]?.previewUrl).toBe("");
    await waitFor(() => expect(result.current.previewLoading).toBe(false));
    expect(fetchBlob.mock.calls[0]?.[0]).toContain("outputScope=half");
    expect(result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/);
    state.scope = "head";
    rerender();
    expect(result.current.items[0]?.previewUrl).toBe("");
    await waitFor(() => expect(fetchBlob).toHaveBeenCalledTimes(2));
    expect(fetchBlob.mock.calls[1]?.[0]).toContain("outputScope=head");
  });
  it("waits until refine finishes", async () => {
    state.refining = true;
    const { rerender } = mount();
    expect(fetchBlob).not.toHaveBeenCalled();
    act(() => {
      state.refining = false;
      rerender();
    });
    await waitFor(() => expect(fetchBlob).toHaveBeenCalledTimes(1));
  });
  it("errors never fall back to full-body preview and retry recovers", async () => {
    fetchBlob.mockRejectedValueOnce(new Error("offline"));
    const { result } = mount();
    await waitFor(() => expect(result.current.previewError).toBe(true));
    expect(result.current.items[0]?.previewUrl).toBe("");
    act(() => result.current.retryPreview());
    await waitFor(() => expect(result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/));
  });
  it("catalog failure shows an error, not infinite loading", () => {
    state.catalogError = true;
    const { result } = mount();
    expect(result.current.previewLoading).toBe(false);
    expect(result.current.previewError).toBe(true);
    expect(fetchBlob).not.toHaveBeenCalled();
  });
  it.each(["legacy", "bvh"])("%s does not request a cropped output", (mode) => {
    if (mode === "legacy") state.enabled = false;
    else state.format = "bvh";
    const { result } = mount();
    expect(result.current.items[0]?.previewUrl).toBe("FULL_BODY");
    expect(fetchBlob).not.toHaveBeenCalled();
    expect(result.current.previewLoading).toBe(false);
  });
});
