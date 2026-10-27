/** Replays actual BFF joined-handler responses. This is a LOCAL fixture, not installed-app E2E. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { ReactNode } from "react";
import wire from "../api/fixtures/scene-bff-wire.json";
import { sceneContractFixture } from "../api/scene.fixtures";
import { downloadScene } from "../api/scene";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { bodyKeys } from "@/features/body-selection/api";
import type { BodySelection } from "@/features/body-selection/contract";
import type { BodyReview } from "@/features/body-selection/review";
import { handKeys } from "@/features/hand-selection/api";
import { useExportStore } from "../store/exportStore";
const mock = vi.hoisted(() => ({ save: vi.fn(), track: vi.fn() }));
vi.mock("@/shared/lib/env", () => ({
  env: { useMockPoseApi: false, isProduction: false, apiBaseUrl: "https://bff.fixture" },
}));
vi.mock("../api/export.service", () => ({ exportService: { saveCandidates: mock.save } }));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: mock.track,
  currentSurface: () => "app",
  resetAnalyticsQueue: vi.fn(),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { defaultCharacterId: "chosen", characters: [] } }),
}));
vi.mock("@/shared/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
const { SavePage } = await import("../pages/SavePage");
const { BarSavePage } = await import("@/features/bar/pages/BarSavePage");
type WireResponse = { status: number; headers: Record<string, string>; bodyBase64: string };
type Scenario = "ok" | "body" | "runtime" | "substitution";
const owner = "wire-owner",
  clientJob = "client-scene";
const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
function response(source: WireResponse) {
  return new Response(bytes(source.bodyBase64), { status: source.status, headers: source.headers });
}
let requests: Record<string, unknown>[];
let scenario: Scenario;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  // Only Date is fixed. Real timers still drive React/PNG loading and expiry guards.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(wire.generatedAt));
  __resetApiClient();
  setInstallationCredentials({ installationId: owner, deviceToken: "local-fixture" });
  useInstallationStore.setState({
    credentials: {
      installationId: owner,
      deviceToken: "local-fixture",
      consentVersion: "2026-08-02",
    },
  });
  usePoseSelectionStore.setState({
    jobId: clientJob,
    serverJobId: wire.jobId,
    selectedByPerson: { 0: "pick0", 1: "pick1" },
    characterId: null,
    characterByPerson: {},
    refineByPerson: {},
  });
  useExportStore.setState({
    jobId: clientJob,
    folder: "/fixture",
    fileName: "scene.fbx",
    format: "fbx",
    status: "idle",
    savedPaths: [],
    error: null,
    errorCode: undefined,
  });
  mock.save.mockResolvedValue([{ path: "/fixture/scene.fbx" }]);
  requests = [];
  scenario = "ok";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path =
        new URL(input, "https://bff.fixture").pathname +
        new URL(input, "https://bff.fixture").search;
      const individual = wire.individuals.find((i) => i.reference.exportPath === path);
      if (individual) return response(individual.response);
      if (path !== `/v1/analysis/jobs/${wire.jobId}/scene`)
        throw new Error("Unexpected fixture request");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      if (body.prepare) return response(wire.responses.prepare);
      if (body.preview)
        return response(
          scenario === "body"
            ? wire.responses.invalidatedBodyPreview
            : scenario === "runtime"
              ? wire.responses.invalidatedRuntimePreview
              : wire.responses.preview,
        );
      if (body.saveMode === "original-selection" || !body.saveMode)
        return response(wire.responses.original);
      return response(
        scenario === "substitution"
          ? { ...wire.responses.confirm, bodyBase64: wire.responses.original.bodyBase64 }
          : wire.responses.confirm,
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetApiClient();
});
function mount(surface: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(poseQueryKeys.result(clientJob), {
    jobId: wire.jobId,
    capabilities: {
      fbxExport: true,
      sceneExport: true,
      sceneRefinement: true,
      sceneSaveContract: sceneContractFixture,
      bodyPreviews: true,
      handSelection: true,
      characterSelection: false,
    },
    people: wire.persons.map((p) => ({
      index: p.personIndex,
      outputScope: {
        selection: "half",
        resolved: "half",
        detected: "half",
        meshScope: "half",
        detectionSource: "vlm_person",
        resolutionSource: "user",
      },
      candidates: [
        {
          id: p.candidateId,
          poseId: `pose${p.personIndex}`,
          bvhUrl: `/fixture/export/${p.personIndex}`,
        },
      ],
    })),
  } as AnalysisResult);
  for (const i of wire.individuals) {
    const h = new Headers(i.response.headers);
    const selection = {
      resolutionStatus: "ready",
      selectionRevision: Number(h.get("X-Standin-Body-Revision")),
      resolvedBody: { characterId: "chosen", assetSha256: h.get("X-Standin-Character-SHA256") },
    } as BodySelection;
    const hand = {
      revision: Number(h.get("X-Standin-Hand-Revision")),
      library_sha256: h.get("X-Standin-Hand-Library-SHA256")!,
    };
    qc.setQueryData(bodyKeys.selection(owner, wire.jobId, i.personIndex), selection);
    qc.setQueryData(handKeys.selection(owner, wire.jobId, i.personIndex), hand);
    qc.setQueryData(
      [...bodyKeys.person(owner, wire.jobId, i.personIndex), "review", i.reference.candidateId],
      {
        personIndex: i.personIndex,
        candidateId: i.reference.candidateId,
        exportUrl: `/fixture/export/${i.personIndex}`,
        scope: "half",
        selection,
        hands: { revision: hand.revision, librarySha256: hand.library_sha256 },
        downloadUrl: i.reference.exportPath,
        artifactSha256: h.get("X-Standin-Artifact-SHA256"),
        reviewKey: h.get("X-Standin-Review-Key"),
        previewUrl: "",
      } as BodyReview,
    );
  }
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[surface === "app" ? `/app/jobs/${clientJob}/save` : "/bar/save"]}
      >
        <Routes>
          <Route path="/app/jobs/:jobId/save" element={<SavePage />} />
          <Route path="/bar/save" element={<BarSavePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}
async function corrected(surface: string) {
  const view = mount(surface);
  fireEvent.click(screen.getByRole("button", { name: "자동 보정" }));
  await screen.findByText("결과 확인");
  return view;
}
async function assertWritten(expected: WireResponse) {
  await screen.findByText("FBX 파일 1개를 저장했어요.");
  const files = mock.save.mock.calls[0]![0].files as { content: Uint8Array; fileName: string }[];
  expect(files).toHaveLength(1);
  expect(Array.from(files[0]!.content)).toEqual(Array.from(bytes(expected.bodyBase64)));
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(files[0]!.content));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  expect(hash).toBe(expected.headers["x-standin-artifact-sha256"]);
  expect(mock.track.mock.calls.some(([name]) => name === "export_failed")).toBe(false);
}
it.each(["app", "bar"])(
  "%s real adapter + hook consumes captured BFF prepare/preview/confirm and saves exact bytes",
  async (surface) => {
    await corrected(surface);
    await screen.findByRole("img", { name: "저장할 결과 미리보기" });
    expect(screen.getByText("포즈: 선택한 포즈 그대로")).toBeVisible();
    expect(screen.getByText("포즈: 변경됨")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await assertWritten(wire.responses.confirm);
    expect(requests).toEqual([wire.requests.prepare, wire.requests.preview, wire.requests.confirm]);
  },
);
it.each(["app", "bar"])(
  "%s sends explicit original mode and writes one original file",
  async (surface) => {
    mount(surface);
    fireEvent.click(screen.getByRole("button", { name: "선택한 포즈 그대로" }));
    await assertWritten(wire.responses.original);
    expect(requests).toEqual([wire.requests.original]);
  },
);
it.each(["app", "bar"])(
  "%s returns from correction to the same original references",
  async (surface) => {
    await corrected(surface);
    fireEvent.click(screen.getByRole("button", { name: "선택한 포즈 그대로 저장" }));
    await assertWritten(wire.responses.original);
    expect(requests.at(-1)).toEqual(wire.requests.original);
    expect(requests.some((r) => r.reviewKey && !r.preview)).toBe(false);
  },
);
it.each(["app", "bar"])(
  "%s cancel sends no confirmed download and no export_failed",
  async (surface) => {
    await corrected(surface);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await screen.findByText("저장을 취소했어요. 선택한 포즈는 그대로예요.");
    expect(mock.save).not.toHaveBeenCalled();
    expect(
      mock.track.mock.calls.some(
        ([name]) => name === "export_failed" || name === "export_completed",
      ),
    ).toBe(false);
    expect(requests.some((r) => r.reviewKey && !r.preview)).toBe(false);
  },
);
it.each(["app", "bar"])(
  "%s blocks a substituted final artifact at the native boundary",
  async (surface) => {
    scenario = "substitution";
    await corrected(surface);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(useExportStore.getState().errorCode).toBe("SCENE_INTEGRITY"));
    expect(mock.save).not.toHaveBeenCalled();
  },
);
it.each(["app", "bar"])(
  "%s consumes captured body/runtime invalidation and requires per-person confirmation",
  async (surface) => {
    for (const kind of ["body", "runtime"] as const) {
      scenario = kind;
      const view = mount(surface);
      fireEvent.click(screen.getByRole("button", { name: "자동 보정" }));
      await waitFor(() =>
        expect(useExportStore.getState().errorCode).toBe(
          kind === "body" ? "BODY_PREVIEW_STALE" : "PREVIEW_NOT_READY",
        ),
      );
      expect(screen.queryByText("결과 확인")).toBeNull();
      expect(screen.getByRole("button", { name: "다시 확인" })).toBeVisible();
      expect(mock.save).not.toHaveBeenCalled();
      for (const p of wire.persons)
        expect(
          view.qc.getQueryData([
            ...bodyKeys.person(owner, wire.jobId, p.personIndex),
            "review",
            p.candidateId,
          ]),
        ).toBeUndefined();
      view.unmount();
      useExportStore.setState({ status: "idle", error: null, errorCode: undefined });
    }
  },
);
it("legacy original download remains compatible with the captured v4-enabled BFF", async () => {
  const output = await downloadScene(wire.jobId, wire.persons);
  expect(Array.from(output)).toEqual(Array.from(bytes(wire.responses.legacyOriginal.bodyBase64)));
  expect(requests).toEqual([{ persons: wire.persons }]);
});
