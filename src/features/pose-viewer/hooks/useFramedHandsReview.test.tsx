vi.mock("@/features/export/lib/preparedArtifact", () => ({
  loadPreparedImage: async (url: string) => url,
}));
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { catalog, selection } from "@/features/hand-selection/fixtures";
const mocks = vi.hoisted(() => ({ load: vi.fn(), put: vi.fn() }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "hands-review-owner" }));
vi.mock("@/features/hand-selection/api", async (original) => ({
  ...(await original<typeof import("@/features/hand-selection/api")>()),
  getHandCatalog: async () => catalog,
  getHandSelection: async () => selection,
  putHandSelection: mocks.put,
  loadHandReview: mocks.load,
}));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    bodies: { enabled: false, entries: [] },
    data: {
      source: "semantic",
      semantic: { query: "공을 던지는 자세", index: {} },
      jobId: "job",
      capabilities: { handSelection: true, fbxExport: true, outputScopeCropping: true },
      people: [{ index: 0 }],
    },
    items: [
      {
        personIndex: 0,
        candidate: { id: "p" },
        refined: false,
        exportUrl: "/v1/pose-candidates/p/export?jobId=job&personIndex=0&candidateId=p",
      },
    ],
    isRefining: false,
  }),
}));
vi.mock("@/features/export/store/exportStore", () => ({
  useExportStore: Object.assign(() => "fbx", { setState: vi.fn() }),
}));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("../store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({ characterId: "master", characterByPerson: {} }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: {
      characters: [{ characterId: "master", availability: "available" }],
      defaultCharacterId: "master",
    },
    isSuccess: true,
    isPending: false,
    isError: false,
  }),
}));
const { useFramedReview } = await import("./useFramedReview");
it("a semantic job without image/camera can edit hands and stays blocked until the updated FBX receipt arrives", async () => {
  mocks.load.mockResolvedValueOnce({ image: "", handReceipt: { downloadUrl: "original-hands" } });
  let finish!: (value: unknown) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.put.mockResolvedValue({ ...selection, left: "fist", revision: 1, changed: ["left"] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.items[0]?.previewUrl).toBe("original-hands"));
  expect(mocks.load.mock.calls[0]![0]).toContain("handSelectionRevision=0");
  act(() => result.current.hands.change(selection, { left: "fist" }));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  expect(mocks.load.mock.calls[1]![0]).toContain("handSelectionRevision=1");
  expect(result.current.previewLoading).toBe(true);
  expect(result.current.items[0]?.previewUrl).not.toBe("original-hands");
  await act(async () => {
    finish({ image: "", handReceipt: { downloadUrl: "new-hands" } });
  });
  await waitFor(() => expect(result.current.items[0]?.previewUrl).toBe("new-hands"));
  expect(result.current.previewLoading).toBe(false);
});
