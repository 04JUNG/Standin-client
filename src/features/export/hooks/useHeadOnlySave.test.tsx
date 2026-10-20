import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useExportStore } from "../store/exportStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyKeys } from "@/features/body-selection/api";
import { handKeys } from "@/features/hand-selection/api";
import { selection as hands } from "@/features/hand-selection/fixtures";
import type { BodySelection } from "@/features/body-selection/contract";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
const mock = vi.hoisted(() => ({ bytes: vi.fn(), body: vi.fn(), hand: vi.fn(), save: vi.fn() }));
vi.mock("@/shared/lib/env", () => ({ env: { useMockPoseApi: false, isProduction: false } }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  apiFetchBytes: mock.bytes,
}));
vi.mock("@/features/body-selection/review", async (original) => ({
  ...(await original<typeof import("@/features/body-selection/review")>()),
  downloadBodyReview: mock.body,
}));
vi.mock("@/features/hand-selection/api", async (original) => ({
  ...(await original<typeof import("@/features/hand-selection/api")>()),
  downloadHandReview: mock.hand,
}));
vi.mock("../api/export.service", () => ({ exportService: { saveCandidates: mock.save } }));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
  resetAnalyticsQueue: vi.fn(),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: {
      defaultCharacterId: "master",
      characters: [{ characterId: "master", displayName: "Master", availability: "available" }],
    },
  }),
}));
const { useSaveFlow } = await import("./useSaveFlow");
const body = {
  resolutionStatus: "ready",
  selectionRevision: 1,
  resolvedBody: { assetSha256: "a".repeat(64), characterId: "master" },
} as BodySelection;
const url = (index: number) =>
  `/v1/pose-candidates/pose/export?jobId=job&personIndex=${index}&candidateId=pick${index}`;
beforeEach(() => {
  vi.clearAllMocks();
  mock.bytes.mockResolvedValue(new Uint8Array([1]));
  mock.body.mockResolvedValue(new Uint8Array([2]));
  mock.hand.mockResolvedValue(new Uint8Array([3]));
  mock.save.mockResolvedValue([{ path: "/fixture/result.fbx" }]);
  useExportStore.setState({
    jobId: "job",
    folder: "/fixture",
    format: "fbx",
    fileName: "pose.fbx",
    status: "idle",
    savedPaths: [],
    error: null,
  });
  usePoseSelectionStore.setState({
    jobId: "job",
    selectedByPerson: { 0: "pick0" },
    refineByPerson: {},
    characterId: "master",
    characterByPerson: {},
  });
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "fixture", consentVersion: "2026-08-02" },
  });
});
function mount(
  scopes: string[],
  bodyMode = false,
  staleBodyHands = false,
  generatedMixed = false,
  selectedBody = body,
) {
  const qc = new QueryClient();
  qc.setQueryData(poseQueryKeys.result("job"), {
    jobId: "job",
    capabilities: {
      fbxExport: true,
      outputScopeCropping: true,
      handSelection: true,
      characterSelection: true,
      bodyPreviews: bodyMode,
    },
    people: scopes.map((scope, index) => ({
      index,
      outputScope: {
        selection: scope,
        resolved: scope,
        detected: "head",
        detectionSource: "vlm_person",
        resolutionSource: "user",
      },
      candidates: [
        {
          id: `pick${index}`,
          bvhUrl: url(index),
          ...(generatedMixed
            ? {
                source: index === 0 ? "generation" : "library",
                poseId: index === 0 ? null : "pose",
                manualExportAllowed: true,
                lookupAllowed: true,
                bvhAvailable: true,
                sourceBvhSha256: "a".repeat(64),
              }
            : {}),
        },
      ],
    })),
  } as AnalysisResult);
  usePoseSelectionStore.setState({
    selectedByPerson: Object.fromEntries(scopes.map((_, i) => [i, `pick${i}`])),
  });
  scopes.forEach((scope, i) => {
    qc.setQueryData(handKeys.selection("owner", "job", i), { ...hands, personIndex: i });
    if (bodyMode) {
      qc.setQueryData(bodyKeys.selection("owner", "job", i), selectedBody);
      qc.setQueryData([...bodyKeys.person("owner", "job", i), "review", `pick${i}`], {
        candidateId: `pick${i}`,
        personIndex: i,
        exportUrl: url(i),
        scope,
        selection: selectedBody,
        downloadUrl: "/fixture/paired.fbx",
        ...(staleBodyHands
          ? { hands: { revision: hands.revision, librarySha256: hands.library_sha256 } }
          : {}),
      });
    }
    if (scope === "half")
      qc.setQueryData(["framed-preview", "owner", `pick${i}`], {
        handReceipt: {
          revision: hands.revision,
          librarySha256: hands.library_sha256,
          downloadUrl:
            url(i).replace("/export", "/framed") + "&outputScope=half&characterId=master",
        },
      });
  });
  return renderHook(() => useSaveFlow("job"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}
it.each(["head", "shoulder_head", "bust"])(
  "saves %s using the framed artifact without requiring stale cached hand receipts",
  async (scope) => {
    const hook = mount([scope]);
    await waitFor(() => expect(hook.result.current.status).toBe("saved"));
    expect(mock.bytes.mock.calls[0]?.[0]).toContain(`outputScope=${scope}`);
    expect(mock.bytes.mock.calls[0]?.[0]).not.toContain("handSelectionRevision");
    expect(mock.hand).not.toHaveBeenCalled();
  },
);
it("a head/body scene skips hands only for the head person", async () => {
  const hook = mount(["head", "half"]);
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.bytes).toHaveBeenCalledTimes(1);
  expect(mock.hand).toHaveBeenCalledTimes(1);
  expect(mock.hand.mock.calls[0]?.[0].downloadUrl).toContain("personIndex=1");
});
it("head with body selection accepts the paired no-hand body receipt despite the hand capability", async () => {
  const hook = mount(["head"], true);
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.body).toHaveBeenCalledTimes(1);
  expect(mock.hand).not.toHaveBeenCalled();
});
it("head rejects an old body receipt that still carries hand identity", async () => {
  const hook = mount(["head"], true, true);
  await waitFor(() => expect(hook.result.current.status).toBe("error"));
  expect(mock.body).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
});

it.each([
  ["PREVIEW_UNAVAILABLE", "choose"],
  ["PREVIEW_HASH_MISMATCH", "choose"],
  ["BODY_PREVIEW_STALE", "review"],
  ["HANDS_CHANGED", "review"],
  ["OUTPUT_SCOPE_CHANGED", "review"],
  ["CONVERTER_TIMEOUT", "retry"],
])("preserves %s at save and writes no substitute", async (code, action) => {
  const { ApiError } = await import("@/shared/api/errors");
  mock.bytes.mockRejectedValueOnce(new ApiError(409, code!, "private BVH token"));
  const { result } = mount(["head"]);
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.recovery.action).toBe(action);
  expect(result.current.error).not.toContain("private");
  expect(result.current.error).not.toContain("폴더");
  expect(mock.save).not.toHaveBeenCalled();
});

it("saves generated/library mixed people as the exact individual reviewed bytes", async () => {
  mock.body.mockImplementation(async (receipt) => new Uint8Array([receipt.personIndex + 7]));
  const hook = mount(["head", "head"], true, false, true);
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.body).toHaveBeenCalledTimes(2);
  const files = mock.save.mock.calls[0]?.[0].files;
  expect(files).toHaveLength(2);
  expect(files[0].content).toEqual(new Uint8Array([7]));
  expect(files[1].content).toEqual(new Uint8Array([8]));
  expect(files[0].fileName).not.toBe(files[1].fileName);
});

it("saves the reviewed male fallback when body detection failed", async () => {
  const fallback = {
    ...body,
    resolvedBody: { ...body.resolvedBody!, characterId: "male-base-v0-7-2" },
    resolvedSource: "catalog_default_fallback",
    recommendation: { status: "unavailable", body: null, reasonCodes: [] },
  } as BodySelection;
  const hook = mount(["head"], true, false, false, fallback);
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.body.mock.calls[0]?.[0].selection.resolvedBody.characterId).toBe("male-base-v0-7-2");
  expect(mock.save).toHaveBeenCalledTimes(1);
});

it("a late download after another person's selection changes writes no stale file", async () => {
  const finishes: ((bytes: Uint8Array) => void)[] = [];
  mock.bytes.mockImplementation(
    () =>
      new Promise<Uint8Array>((resolve) => {
        finishes.push(resolve);
      }),
  );
  const hook = mount(["head", "head"]);
  await waitFor(() => expect(mock.bytes).toHaveBeenCalledTimes(2));
  act(() => usePoseSelectionStore.setState({ selectedByPerson: { 0: "pick0", 1: "new-pick" } }));
  // Both downloads are obsolete as a group; releasing the last one cannot save.
  await act(async () => finishes.forEach((finish) => finish(new Uint8Array([1]))));
  await waitFor(() => expect(hook.result.current.status).toBe("error"));
  expect(mock.save).not.toHaveBeenCalled();
});
