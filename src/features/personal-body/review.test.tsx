import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useLocalBodies, localSelectionKey } from "./store";
import type { LocalModel } from "./contract";
const fixtures = vi.hoisted(() => ({
  prepare: vi.fn(),
  loadServerBody: vi.fn(),
  item: {
    personIndex: 0,
    candidate: { id: "p", title: "pose" },
    refined: false,
    exportUrl: "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=p",
    previewUrl: "",
  },
}));
vi.mock("./prepare", async (original) => ({
  ...(await original<typeof import("./prepare")>()),
  prepareLocal: fixtures.prepare,
}));
vi.mock("@/features/body-selection/review", () => ({ loadBodyReview: fixtures.loadServerBody }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("@/features/pose-viewer/hooks/useSelectionReview", () => ({
  useSelectionReview: () => ({
    bodies: { enabled: true, ready: false, entries: [] },
    data: { jobId: "job", capabilities: { fbxExport: true }, people: [{ index: 0 }] },
    items: [fixtures.item],
    isRefining: false,
  }),
}));
vi.mock("@/features/hand-selection/hooks", () => ({
  useHands: () => ({ entries: [], ready: true, enabled: true, jobId: "job" }),
}));
vi.mock("@/features/export/store/exportStore", () => ({ useExportStore: () => "fbx" }));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("@/features/pose-viewer/store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({ characterId: null, characterByPerson: {} }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: undefined, isSuccess: false, isError: true, refetch: vi.fn() }),
}));
const { useFramedReview } = await import("@/features/pose-viewer/hooks/useFramedReview");
const model: LocalModel = {
  localModelId: "00000000-0000-4000-8000-000000000001",
  name: "My body",
  sourceHash: "a".repeat(64),
  format: "fbx",
  version: 1,
  importerVersion: "1",
  normalizationVersion: "1",
  rigMappingVersion: "1",
  converterVersion: "1",
  createdAt: 1,
  updatedAt: 1,
  capabilities: { bodyPose: true, leftHand: false, rightHand: false },
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  fixtures.prepare.mockReset();
  fixtures.loadServerBody.mockReset();
  useLocalBodies.setState({
    models: [model],
    selected: { [localSelectionKey("job", 0)]: model.localModelId },
    scroll: {},
  });
});
it("permits verified local FBX before any image and without server body preparation", async () => {
  fixtures.prepare.mockImplementation(async (_job, _model, _item, _scope, binding) => ({
    binding,
    content: new Uint8Array([1, 2, 3]),
    snapshotHash: "b".repeat(64),
    artifactHash: "c".repeat(64),
    poseHash: "d".repeat(64),
  }));
  const { result } = setup();
  await waitFor(() => expect(result.current.downloadReady).toBe(true));
  expect(result.current.items[0]?.localFbx).toEqual(new Uint8Array([1, 2, 3]));
  expect(result.current.items[0]?.previewUrl).toBe("");
  expect(fixtures.loadServerBody).not.toHaveBeenCalled();
});
it("blocks old local artifacts immediately when a model is replaced even if transport ignores cancellation", async () => {
  let finishOld: (value: unknown) => void = () => {};
  fixtures.prepare.mockImplementationOnce(
    (_j, _m, _i, _s, binding) =>
      new Promise((resolve) => {
        finishOld = () => resolve({ binding, content: new Uint8Array([1]) });
      }),
  );
  fixtures.prepare.mockImplementationOnce(() => new Promise(() => {}));
  const { result } = setup();
  await waitFor(() => expect(fixtures.prepare).toHaveBeenCalledTimes(1));
  act(() =>
    useLocalBodies.getState().setModels([{ ...model, version: 2, sourceHash: "e".repeat(64) }]),
  );
  await waitFor(() => expect(fixtures.prepare).toHaveBeenCalledTimes(2));
  await act(async () => finishOld(undefined));
  expect(result.current.downloadReady).toBe(false);
  expect(result.current.items[0]?.localFbx).toBeUndefined();
});
it("shows a recoverable worker error without preparing a different body", async () => {
  fixtures.prepare.mockRejectedValue({ code: "RUNTIME_UNAVAILABLE" });
  const { result } = setup();
  await waitFor(() => expect(result.current.preparationError).toBe(true));
  expect(result.current.downloadReady).toBe(false);
  expect(result.current.previewFailure.message).toContain("업데이트");
  expect(fixtures.loadServerBody).not.toHaveBeenCalled();
});
