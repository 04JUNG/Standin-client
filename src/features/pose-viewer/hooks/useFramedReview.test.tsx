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
    model: false,
    base: false,
    refined: false,
    webgl: true,
    serverBase: false,
  },
  fetchBlob: vi.fn(),
}));
vi.mock("@/shared/api/client", () => ({ apiFetchBlob: fetchBlob }));
vi.mock("../preview/modelContract", () => ({
  validateModel: vi.fn((_data, _source, _character, _scope, version = "posed-mesh-v1") => {
    if ((version === "posed-mesh-v1") !== state.serverBase) throw new Error("model version");
    return {
      source_bvh_sha256: "a".repeat(64),
      character_sha256: "b".repeat(64),
      revision: "c".repeat(64),
    };
  }),
}));
vi.mock("../preview/modelSupport", () => ({ modelRenderingAvailable: () => state.webgl }));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    bodies: { enabled: false, entries: [], ready: true },
    data: {
      capabilities: {
        fbxExport: true,
        outputScopeCropping: state.enabled,
        characterSelection: false,
        modelPreview: state.model,
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
        candidate: {
          id: "p",
          previewModel: state.base
            ? {
                url: "/base-model",
                sourceSha: "a".repeat(64),
                rotation: [
                  [1, 0, 0],
                  [0, 1, 0],
                  [0, 0, 1],
                ],
              }
            : undefined,
        },
        exportUrl: "/v1/pose-candidates/p/export?jobId=j&personIndex=0&candidateId=p",
        previewUrl: "FULL_BODY",
        refined: state.refined,
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
      model: false,
      base: false,
      refined: false,
      webgl: true,
      serverBase: false,
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
  it("unsupported WebGL goes directly to PNG without preparing a model first", async () => {
    Object.assign(state, { model: true, webgl: false });
    const { result } = mount();
    await waitFor(() => expect(result.current.previewLoading).toBe(false));
    expect(fetchBlob.mock.calls[0]![0]).toContain("format=preview");
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });
  it("waits for the model's first frame, then allows save without a PNG request", async () => {
    state.model = true;
    fetchBlob.mockResolvedValue({
      type: "model/gltf-binary",
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.items[0]?.previewModel).toBeDefined());
    expect(result.current.previewLoading).toBe(true);
    act(() => result.current.items[0]!.onModelStatus("ready"));
    expect(result.current.previewLoading).toBe(false);
    expect(fetchBlob.mock.calls[0]![0]).toContain("format=model");
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });
  it("WebGL failure requests the exact scoped PNG and keeps save blocked until ready", async () => {
    state.model = true;
    fetchBlob.mockResolvedValueOnce({
      type: "model/gltf-binary",
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.items[0]?.previewModel).toBeDefined());
    act(() => result.current.items[0]!.onModelStatus("failed"));
    expect(result.current.previewLoading).toBe(true);
    await waitFor(() => expect(result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/));
    expect(fetchBlob.mock.calls[1]![0]).toContain("format=preview");
    expect(fetchBlob.mock.calls[1]![0]).toContain("outputScope=half");
  });
  it("an unchanged full pose can be viewed while its FBX is still preparing", async () => {
    Object.assign(state, { model: true, base: true, scope: "full", serverBase: true });
    fetchBlob.mockResolvedValue({
      type: "model/gltf-binary",
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.items[0]?.previewModel?.base).toBeDefined());
    act(() => result.current.items[0]!.onModelStatus("ready"));
    expect(result.current.previewLoading).toBe(false);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(fetchBlob.mock.calls[0]![0]).toContain("useLibraryModel=true");
  });
  it("server refine wins when the client missed its response", async () => {
    Object.assign(state, { model: true, base: true, refined: false, scope: "full" });
    fetchBlob.mockResolvedValue({
      type: "model/gltf-binary",
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.items[0]?.previewModel).toBeDefined());
    expect(result.current.items[0]?.previewModel?.base).toBeUndefined();
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });
  it("a refined pose never uses a precomputed base model", async () => {
    Object.assign(state, { model: true, base: true, refined: true, scope: "full" });
    fetchBlob.mockResolvedValue({
      type: "model/gltf-binary",
      arrayBuffer: async () => new ArrayBuffer(32),
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.items[0]?.previewModel).toBeDefined());
    expect(result.current.items[0]?.previewModel?.base).toBeUndefined();
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });
  it("errors never fall back to full-body preview and retry recovers", async () => {
    fetchBlob.mockRejectedValueOnce(new Error("offline"));
    const { result } = mount();
    await waitFor(() => expect(result.current.previewError).toBe(true));
    expect(result.current.items[0]?.previewUrl).toBe("");
    await act(async () => {
      await result.current.retryPreview();
    });
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
