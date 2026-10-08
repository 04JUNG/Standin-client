import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({ retryBody: vi.fn(), load: vi.fn() }));
vi.mock("@/features/body-selection/review", () => ({ loadBodyReview: fixtures.load }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    bodies: {
      enabled: true,
      entries: [
        {
          personIndex: 0,
          selection: {
            resolutionStatus: "ready",
            selectionRevision: 2,
          },
          retry: fixtures.retryBody,
        },
      ],
    },
    data: { jobId: "job", capabilities: { fbxExport: true }, people: [{ index: 0 }] },
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
vi.mock("@/features/export/store/exportStore", () => ({ useExportStore: () => "fbx" }));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("../store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({ characterId: null, characterByPerson: {} }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: undefined, isSuccess: false, isError: true, refetch: vi.fn() }),
}));
const { useFramedReview } = await import("./useFramedReview");
it("refreshes body state and revalidates the final preview on retry, without requiring the legacy catalog", async () => {
  fixtures.retryBody.mockResolvedValue(undefined);
  fixtures.load.mockRejectedValueOnce(new Error("BODY_PREVIEW_STALE"));
  fixtures.load.mockResolvedValue({ previewUrl: "verified-new-body" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.previewError).toBe(true));
  await act(async () => {
    await result.current.retryPreview();
  });
  await waitFor(() => expect(result.current.items[0]?.previewUrl).toBe("verified-new-body"));
  expect(fixtures.retryBody).toHaveBeenCalledTimes(1);
  expect(fixtures.load).toHaveBeenCalledTimes(2);
  expect(result.current.previewError).toBe(false);
});
