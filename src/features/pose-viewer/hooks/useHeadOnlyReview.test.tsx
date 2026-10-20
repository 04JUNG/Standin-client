vi.mock("@/features/export/lib/preparedArtifact", async (original) => ({
  ...(await original<typeof import("@/features/export/lib/preparedArtifact")>()),
  loadPreparedImage: async (url: string) =>
    url === "body-hands" ? url : "data:image/png;base64,Zml4dHVyZQ==",
}));
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { catalog, selection } from "@/features/hand-selection/fixtures";
const mocks = vi.hoisted(() => ({
  scopes: ["head"],
  get: vi.fn(),
  getCatalog: vi.fn(),
  handReview: vi.fn(),
  png: vi.fn(),
}));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("@/features/hand-selection/api", async (original) => ({
  ...(await original<typeof import("@/features/hand-selection/api")>()),
  getHandCatalog: mocks.getCatalog,
  getHandSelection: mocks.get,
  loadHandReview: mocks.handReview,
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  apiFetchResponse: mocks.png,
}));
vi.mock("./useSelectionReview", () => ({
  useSelectionReview: () => ({
    bodies: { enabled: false, entries: [] },
    data: {
      jobId: "job",
      capabilities: { handSelection: true, fbxExport: true, outputScopeCropping: true },
      people: mocks.scopes.map((scope, index) => ({
        index,
        outputScope: {
          selection: "auto",
          detected: scope,
          meshScope: scope,
          resolved: scope,
          detectionSource: "vlm_person",
          resolutionSource: "auto",
        },
      })),
    },
    items: mocks.scopes.map((_, personIndex) => ({
      personIndex,
      candidate: { id: `pick${personIndex}` },
      refined: false,
      exportUrl: `/v1/pose-candidates/pose/export?jobId=job&personIndex=${personIndex}&candidateId=pick${personIndex}`,
    })),
    isRefining: false,
  }),
}));
vi.mock("@/features/export/store/exportStore", () => ({ useExportStore: () => "fbx" }));
vi.mock("@/features/models/store/modelStore", () => ({ useModelStore: () => null }));
vi.mock("../store/poseSelectionStore", () => ({
  usePoseSelectionStore: (select: (s: unknown) => unknown) =>
    select({ characterId: "master", characterByPerson: {} }),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: { characters: [], defaultCharacterId: "master" },
    isSuccess: true,
    isPending: false,
    isError: false,
  }),
}));
const { useFramedReview } = await import("./useFramedReview");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scopes = ["head"];
  mocks.getCatalog.mockResolvedValue(catalog);
  mocks.get.mockImplementation(async (_job: string, index: number) => ({
    ...selection,
    personIndex: index,
  }));
  mocks.handReview.mockResolvedValue({ image: "", handReceipt: { downloadUrl: "body-hands" } });
  mocks.png.mockImplementation(
    async (url: string) =>
      new Response(null, {
        headers: {
          "X-Standin-Artifact-Contract": "verified-fbx-v1",
          "X-Standin-Review-Key": "a".repeat(64),
          "X-Standin-Artifact-SHA256": "b".repeat(64),
          "X-Standin-Character-SHA256": "c".repeat(64),
          "X-Standin-Source-BVH-SHA256": "d".repeat(64),
          "X-Standin-Output-Scope": new URL(url, "https://standin.invalid").searchParams.get(
            "outputScope",
          )!,
        },
      }),
  );
});
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["hands", "owner", "job", 0], { ...selection, revision: 99 });
  return renderHook(() => useFramedReview("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}
it.each(["head", "shoulder_head", "bust"])(
  "%s review proceeds without any hand query, stale revision, hand receipt or hand notice",
  async (scope) => {
    mocks.scopes = [scope];
    const hook = mount();
    await waitFor(() => expect(hook.result.current.previewLoading).toBe(false));
    expect(hook.result.current.previewError).toBe(false);
    expect(hook.result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/);
    expect(mocks.png.mock.calls[0]?.[0]).toContain(`outputScope=${scope}`);
    expect(mocks.png.mock.calls[0]?.[0]).not.toContain("handSelectionRevision");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.getCatalog).not.toHaveBeenCalled();
    expect(mocks.handReview).not.toHaveBeenCalled();
    expect(hook.result.current.hands.enabled).toBe(false);
    expect(hook.result.current.previewNotice).not.toContain("손 모양");
  },
);
it("a head preview does not wait for another person's hand lookup; only that body gets a hand receipt", async () => {
  mocks.scopes = ["head", "half"];
  let finish!: (v: unknown) => void;
  mocks.get.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = mount();
  await waitFor(() => expect(hook.result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/));
  expect(mocks.get.mock.calls[0]?.slice(0, 2)).toEqual(["job", 1]);
  expect(mocks.handReview).not.toHaveBeenCalled();
  await act(async () => {
    finish({ ...selection, personIndex: 1 });
  });
  await waitFor(() => expect(hook.result.current.items[1]?.previewUrl).toBe("body-hands"));
  expect(mocks.handReview.mock.calls[0]?.[0]).toContain("personIndex=1");
  expect(mocks.handReview.mock.calls[0]?.[0]).toContain("handSelectionRevision=");
});
it("full → head → full discards the old hand image and restores validated hand selection", async () => {
  mocks.scopes = ["full"];
  const hook = mount();
  await waitFor(() => expect(hook.result.current.items[0]?.previewUrl).toBe("body-hands"));
  mocks.scopes = ["head"];
  hook.rerender();
  await waitFor(() => expect(hook.result.current.items[0]?.previewUrl).toMatch(/^data:image\/png/));
  expect(hook.result.current.hands.entries).toEqual([]);
  mocks.scopes = ["full"];
  hook.rerender();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(hook.result.current.items[0]?.previewUrl).toBe("body-hands"));
});
