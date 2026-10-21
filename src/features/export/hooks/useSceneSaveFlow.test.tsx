import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { useExportStore } from "../store/exportStore";
import { sceneReviewFixture, sceneContractFixture } from "../api/scene.fixtures";
import { ApiError } from "@/shared/api/errors";
import { bodyKeys } from "@/features/body-selection/api";
const mock = vi.hoisted(() => ({
  bytes: vi.fn(),
  prepare: vi.fn(),
  preview: vi.fn(),
  download: vi.fn(),
  save: vi.fn(),
  track: vi.fn(),
}));
vi.stubGlobal("crypto", webcrypto);
vi.mock("@/shared/lib/env", () => ({ env: { useMockPoseApi: false, isProduction: false } }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  apiFetchBytes: mock.bytes,
}));
vi.mock("../api/scene", async (original) => ({
  ...(await original<typeof import("../api/scene")>()),
  prepareScene: mock.prepare,
  loadScenePreview: mock.preview,
  downloadScene: mock.download,
}));
vi.mock("../api/export.service", () => ({ exportService: { saveCandidates: mock.save } }));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: mock.track,
  currentSurface: () => "app",
  resetAnalyticsQueue: vi.fn(),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { defaultCharacterId: "master", characters: [] } }),
}));
vi.mock("@/shared/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
const { useSaveFlow } = await import("./useSaveFlow");
const { SavePage } = await import("../pages/SavePage");
const { BarSavePage } = await import("@/features/bar/pages/BarSavePage");
beforeEach(() => {
  vi.resetAllMocks();
  mock.bytes.mockResolvedValue(new Uint8Array([1]));
  mock.prepare.mockImplementation(async () => sceneReviewFixture());
  mock.preview.mockResolvedValue("fixture-png");
  mock.download.mockResolvedValue(new Uint8Array([2]));
  mock.save.mockResolvedValue([{ path: "/fixture/scene.fbx" }]);
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "fixture", consentVersion: "2026-08-02" },
  });
  useExportStore.setState({
    jobId: "job",
    folder: "/fixture",
    format: "fbx",
    fileName: "pose.fbx",
    status: "idle",
    savedPaths: [],
    error: null,
    errorCode: undefined,
  });
  usePoseSelectionStore.setState({
    jobId: "job",
    serverJobId: "job",
    selectedByPerson: { 0: "pick0", 1: "pick1" },
    refineByPerson: {},
    characterId: null,
    characterByPerson: {},
  });
});
afterEach(() => vi.useRealTimers());
function setup(negotiated = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(poseQueryKeys.result("job"), {
    jobId: "job",
    inputPreviewUrl: "/fixture/original.png",
    capabilities: {
      fbxExport: true,
      sceneExport: true,
      sceneRefinement: true,
      characterSelection: false,
      ...(negotiated ? { sceneSaveContract: sceneContractFixture } : {}),
    },
    people: [0, 1].map((index) => ({
      index,
      candidates: [
        { id: `pick${index}`, poseId: `old${index}`, bvhUrl: `/v1/export?personIndex=${index}` },
      ],
    })),
  } as AnalysisResult);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}
async function autoCorrect() {
  const { qc, wrapper } = setup();
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
  await waitFor(() => expect(hook.result.current.status).toBe("awaiting-confirm"));
  return { ...hook, qc };
}
it.each(["app", "bar"])(
  "%s real page + hook confirms and saves one integrated FBX (local fixtures)",
  async (surface) => {
    const { wrapper: Provider } = setup();
    render(
      <Provider>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={[surface === "app" ? "/app/jobs/job/save" : "/bar/save"]}
        >
          <Routes>
            <Route path="/app/jobs/:jobId/save" element={<SavePage />} />
            <Route path="/bar/save" element={<BarSavePage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText("선택 인물 2명 · 통합 FBX 1개")).toBeVisible();
    expect(mock.prepare).not.toHaveBeenCalled();
    expect(mock.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "자동 보정 후 확인" }));
    await screen.findByRole("button", { name: "이 장면으로 저장" });
    expect(useExportStore.getState().status).toBe("awaiting-confirm");
    expect(screen.queryByText(/저장하고 있습니다/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이 장면으로 저장" }));
    await screen.findByText("통합 파일 1개를 저장했습니다.");
    expect(mock.save.mock.calls[0]?.[0].files).toHaveLength(1);
    expect(mock.download.mock.calls[0]?.[2].artifactSha256).toBe("b".repeat(64));
    expect(mock.track).toHaveBeenCalledWith(
      "export_completed",
      expect.objectContaining({ fileCount: 1 }),
      "job",
    );
  },
);
it("legacy capability never implicitly opts into v4", async () => {
  const { wrapper } = setup(false);
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.prepare).not.toHaveBeenCalled();
  expect(mock.download.mock.calls[0]?.[2]).toBeUndefined();
  expect(mock.download.mock.calls[0]?.[3].negotiated).toBe(false);
});
it("explicit original selection bypasses v4 prepare", async () => {
  const { wrapper } = setup();
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("original-selection"));
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.prepare).not.toHaveBeenCalled();
  expect(mock.download.mock.calls[0]?.[3].negotiated).toBe(true);
});
it("returns to original refs after correction without changing picks", async () => {
  const hook = await autoCorrect();
  const refs = mock.prepare.mock.calls[0]?.[1];
  await act(async () => hook.result.current.saveOriginalSelection());
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.download.mock.calls[0]?.[1]).toEqual(refs);
  expect(mock.download.mock.calls[0]?.[2]).toBeUndefined();
  expect(usePoseSelectionStore.getState().selectedByPerson).toEqual({ 0: "pick0", 1: "pick1" });
  expect(mock.track.mock.calls.some(([name]) => name === "export_failed")).toBe(false);
});
it("confirmation cancel stays cancelled and emits no export_failed", async () => {
  const hook = await autoCorrect();
  act(() => hook.result.current.cancelScene());
  await waitFor(() => expect(hook.result.current.status).toBe("cancelled"));
  expect(mock.download).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
  expect(mock.track).not.toHaveBeenCalled();
});
it.each(["cancel", "leave"])(
  "%s while preparing aborts HTTP and ignores a late success",
  async (action) => {
    let finish!: (review: ReturnType<typeof sceneReviewFixture>) => void;
    mock.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { wrapper } = setup();
    const hook = renderHook(() => useSaveFlow("job"), { wrapper });
    act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
    await waitFor(() => expect(mock.prepare).toHaveBeenCalledOnce());
    const signal = mock.prepare.mock.calls[0]?.[2] as AbortSignal;
    if (action === "leave") {
      hook.unmount();
      await act(async () => {});
    } else act(() => hook.result.current.cancelSave());
    expect(signal.aborted).toBe(true);
    await act(async () => finish(sceneReviewFixture()));
    expect(useExportStore.getState().status).toBe("cancelled");
    expect(mock.save).not.toHaveBeenCalled();
    expect(mock.track).not.toHaveBeenCalled();
  },
);
it.each(["pick", "scope", "body", "hands"])(
  "%s change invalidates a pending confirmation",
  async (kind) => {
    const hook = await autoCorrect();
    act(() => {
      if (kind === "pick")
        usePoseSelectionStore.setState({ selectedByPerson: { 0: "changed", 1: "pick1" } });
      if (kind === "scope")
        hook.qc.setQueryData(poseQueryKeys.result("job"), (old: AnalysisResult) => ({
          ...old,
          people: old.people.map((p) => ({ ...p, outputScope: { resolved: "half" } })),
        }));
      if (kind === "body")
        hook.qc.setQueryData(bodyKeys.selection("owner", "job", 0), { selectionRevision: 2 });
      if (kind === "hands")
        hook.qc.setQueryData(["hands", "owner", "job", 0, "selection"], { revision: 2 });
    });
    await waitFor(() => expect(hook.result.current.status).toBe("error"));
    expect(hook.result.current.sceneReview).toBeNull();
    expect(hook.result.current.recovery.action).toBe("review");
    expect(mock.save).not.toHaveBeenCalled();
  },
);
it("confirmation expiry requires a fresh prepare", async () => {
  mock.prepare.mockImplementation(async () => ({
    ...sceneReviewFixture(),
    expiresAt: new Date(Date.now() + 100).toISOString(),
  }));
  const hook = await autoCorrect();
  await waitFor(() => expect(hook.result.current.errorCode).toBe("SCENE_REVIEW_EXPIRED"));
  expect(hook.result.current.sceneReview).toBeNull();
  expect(mock.save).not.toHaveBeenCalled();
  mock.prepare.mockImplementation(async () => sceneReviewFixture());
  await act(async () => {
    void hook.result.current.retry();
  });
  await waitFor(() => expect(hook.result.current.status).toBe("awaiting-confirm"));
  expect(mock.prepare).toHaveBeenCalledTimes(2);
});
it.each([
  ["SCENE_REVIEW_REQUIRED", "retry"],
  ["SCENE_SOURCE_CHANGED", "review"],
  ["SCENE_UNSUPPORTED_BODY", "choose"],
  ["SCENE_BUSY", "retry"],
  ["SCENE_TIMEOUT", "retry"],
  ["SCENE_INTEGRITY", "retry"],
  ["SCENE_UNAVAILABLE", "retry"],
  ["SCENE_CONTRACT_UNSUPPORTED", "review"],
])("%s exposes recovery without saving a substitute", async (code, action) => {
  mock.prepare.mockRejectedValueOnce(new ApiError(409, code!, "private worker detail"));
  const { wrapper } = setup();
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
  await waitFor(() => expect(hook.result.current.status).toBe("error"));
  expect(hook.result.current.recovery.action).toBe(action);
  expect(hook.result.current.error).not.toContain("private");
  expect(hook.result.current.error).not.toContain("폴더");
  expect(mock.download).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
  expect(mock.track).toHaveBeenCalledWith(
    "export_failed",
    expect.objectContaining({ code }),
    "job",
  );
});
it("StrictMode effect replay does not cancel the legacy save", async () => {
  const { wrapper: Provider } = setup(false);
  const hook = renderHook(() => useSaveFlow("job"), {
    wrapper: ({ children }) => (
      <StrictMode>
        <Provider>{children}</Provider>
      </StrictMode>
    ),
  });
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mock.save).toHaveBeenCalledOnce();
});

it.each(["app", "bar"])("%s page cancels final scene without a failed export", async (surface) => {
  const { wrapper: Provider } = setup();
  render(
    <Provider>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[surface === "app" ? "/app/jobs/job/save" : "/bar/save"]}
      >
        <Routes>
          <Route path="/app/jobs/:jobId/save" element={<SavePage />} />
          <Route path="/bar/save" element={<BarSavePage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "자동 보정 후 확인" }));
  fireEvent.click(await screen.findByRole("button", { name: /^취소$/ }));
  await screen.findByText("저장을 취소했어요. 선택은 유지됩니다.");
  expect(mock.save).not.toHaveBeenCalled();
  expect(mock.track).not.toHaveBeenCalled();
});
it("late scene download after selection change is never written", async () => {
  let finish!: (data: Uint8Array) => void;
  mock.download.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await autoCorrect();
  act(() => hook.result.current.confirmScene());
  await waitFor(() => expect(mock.download).toHaveBeenCalledOnce());
  act(() => usePoseSelectionStore.setState({ selectedByPerson: { 0: "changed", 1: "pick1" } }));
  await act(async () => finish(new Uint8Array([2])));
  await waitFor(() => expect(hook.result.current.status).toBe("error"));
  expect(mock.save).not.toHaveBeenCalled();
});
it("a network failure during scene prepare is not described as a folder error", async () => {
  mock.prepare.mockRejectedValueOnce({ kind: "network", message: "offline", retryable: true });
  const { wrapper } = setup();
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
  await waitFor(() => expect(hook.result.current.errorCode).toBe("SCENE_FAILED"));
  expect(hook.result.current.error).not.toContain("폴더");
});
it("temporary scene failure preserves per-person review for explicit original save", async () => {
  mock.prepare.mockRejectedValueOnce(new ApiError(503, "SCENE_BUSY", ""));
  const { qc, wrapper } = setup();
  const key = [...bodyKeys.person("owner", "job", 0), "review", "retained"];
  qc.setQueryData(key, { fixture: "receipt" });
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
  await waitFor(() => expect(hook.result.current.status).toBe("error"));
  expect(qc.getQueryData(key)).toEqual({ fixture: "receipt" });
  await act(async () => hook.result.current.saveOriginalSelection());
  expect(mock.save).toHaveBeenCalledOnce();
});

it("preserves the BFF network-disconnect continuation detail for recovery UI", async () => {
  mock.prepare.mockRejectedValueOnce(
    new ApiError(503, "SCENE_UNAVAILABLE", "", undefined, {
      recovery: "retry_later",
      allowedActions: ["retry_later"],
      serverOperationMayContinue: true,
    }),
  );
  const { wrapper } = setup();
  const hook = renderHook(() => useSaveFlow("job"), { wrapper });
  act(() => hook.result.current.chooseSceneMode("auto-correct-v4"));
  await waitFor(() => expect(hook.result.current.serverOperationMayContinue).toBe(true));
  expect(hook.result.current.errorCode).toBe("SCENE_UNAVAILABLE");
});
