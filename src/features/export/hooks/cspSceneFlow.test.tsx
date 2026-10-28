/** Real scene HTTP adapter + shared hook; individual review/native boundaries are synthetic. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { webcrypto } from "node:crypto";
import wire from "../api/fixtures/csp-scene-bff-wire.json";
import prior from "../api/fixtures/scene-bff-wire.json";
import { sceneContractFixture } from "../api/scene.fixtures";
import { sceneAvailabilitySchema, sourceImageSchema } from "../api/sceneMetadata";
import { useSaveFlow } from "./useSaveFlow";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import type { UploadDraft } from "@/shared/types/upload";
import { bodyKeys } from "@/features/body-selection/api";
import { useExportStore } from "../store/exportStore";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
const mock = vi.hoisted(() => ({ save: vi.fn(), body: vi.fn() }));
vi.mock("../api/export.service", () => ({ exportService: { saveCandidates: mock.save } }));
vi.mock("@/features/body-selection/review", async (original) => ({
  ...(await original<typeof import("@/features/body-selection/review")>()),
  downloadBodyReview: mock.body,
}));
vi.mock("@/shared/lib/env", () => ({
  env: { useMockPoseApi: false, isProduction: false, apiBaseUrl: "https://csp.fixture" },
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { defaultCharacterId: "chosen", characters: [] } }),
}));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
  resetAnalyticsQueue: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(wire.generatedAt));
  __resetApiClient();
  setInstallationCredentials({ installationId: "owner", deviceToken: "fixture" });
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "fixture", consentVersion: "2026-08-02" },
  });
  useExportStore.setState({
    partialConsentBinding: undefined,
    individualConsentBinding: undefined,
    jobId: null,
    folder: "/fixture",
    format: "fbx",
    fileName: "",
    status: "idle",
    savedPaths: [],
    error: null,
  });
  useUploadStore.setState({ draft: { id: "p0718", originalName: "p0718.png" } as UploadDraft });
  mock.save.mockResolvedValue([{ path: "/fixture/T001_scene.fbx" }]);
  mock.body.mockImplementation(async (receipt: { personIndex: number }) =>
    Uint8Array.from(atob(prior.individuals[receipt.personIndex].response.bodyBase64), (c) =>
      c.charCodeAt(0),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetApiClient();
});
function mount(name: keyof typeof wire.examples, corrupt = false, delayed = false) {
  const e = wire.examples[name],
    m = e.prepareResponse.manifest,
    job = m.jobId,
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const selected = Object.fromEntries(
    e.prepareRequest.persons.map((p) => [p.personIndex, p.candidateId]),
  );
  usePoseSelectionStore.setState({
    jobId: job,
    serverJobId: job,
    selectedByPerson: selected,
    excludedPeople: name === "user_excluded" ? { 1: "pick1" } : {},
    characterId: null,
    characterByPerson: {},
    refineByPerson: {},
  });
  qc.setQueryData(poseQueryKeys.result(job), {
    jobId: job,
    inputPreviewUrl: "/fixture/T001.png",
    sourceImage: sourceImageSchema.parse(m.sourceImage),
    capabilities: {
      fbxExport: true,
      sceneExport: true,
      refine: false,
      bodyPreviews: true,
      characterSelection: false,
      sceneAvailability: sceneAvailabilitySchema.parse(e.capabilities),
      sceneSaveContract: { ...sceneContractFixture, manifestVersion: "csp-scene-manifest-v1" },
    },
    people: [0, 1].map((index) => ({
      index,
      outputScope: {
        resolved: "half",
        selection: "half",
        detected: "half",
        detectionSource: "vlm_person",
        resolutionSource: "user",
      },
      candidates:
        name === "no_candidates" && index === 1
          ? []
          : [{ id: `pick${index}`, bvhUrl: `/fixture/${index}` }],
    })),
  } as AnalysisResult);
  for (const ref of e.prepareRequest.persons) {
    const selection = {
      resolutionStatus: "ready",
      selectionRevision: 1,
      resolvedBody: { characterId: "chosen", assetSha256: "a".repeat(64) },
    };
    qc.setQueryData(bodyKeys.selection("owner", job, ref.personIndex), selection);
    qc.setQueryData(
      [...bodyKeys.person("owner", job, ref.personIndex), "review", ref.candidateId],
      {
        personIndex: ref.personIndex,
        candidateId: ref.candidateId,
        exportUrl: `/fixture/${ref.personIndex}`,
        scope: "half",
        selection,
        downloadUrl: ref.exportPath,
      },
    );
  }
  const requests: Record<string, unknown>[] = [];
  let finish: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (body.prepare) {
        if (delayed)
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        return new Response(JSON.stringify(e.prepareResponse));
      }
      const headers = {
        ...e.releaseResponse.headers,
        ...(corrupt ? { "x-standin-scene-snapshot-sha256": "f".repeat(64) } : {}),
      };
      return new Response(
        Uint8Array.from(atob(e.releaseResponse.bodyBase64), (c) => c.charCodeAt(0)),
        { headers },
      );
    }),
  );
  const hook = renderHook(() => useSaveFlow(job), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, qc, requests, finish: () => finish?.(), e };
}
it.each(["full", "no_candidates", "user_excluded", "not_requested"] as const)(
  "%s binds partial snapshot, exact FBX bytes, metadata and T001 filename",
  async (name) => {
    const h = mount(name);
    if (name !== "full") {
      expect(mock.body).not.toHaveBeenCalled();
      act(() => h.result.current.confirmPartial());
    }
    act(() => h.result.current.chooseSceneMode("original-selection"));
    await waitFor(() => expect(h.result.current.status).toBe("saved"));
    expect(h.requests[1]).toMatchObject(h.e.releaseRequest);
    const files = mock.save.mock.calls[0][0].files;
    expect(files).toHaveLength(1);
    expect(files[0].fileName).toBe("T001_standin_pose_scene.fbx");
    expect(JSON.parse(files[0].sceneMetadata)).toEqual(h.e.prepareResponse.manifest);
    expect(files[0].content).toEqual(
      Uint8Array.from(atob(h.e.releaseResponse.bodyBase64), (c) => c.charCodeAt(0)),
    );
    expect(h.result.current.comparison.originalUrl).toBe("/fixture/T001.png");
    expect(h.result.current.comparison.selected.map((x) => x.candidateId)).toEqual(
      h.e.prepareRequest.persons.map((x) => x.candidateId),
    );
  },
);
it("rejects a binary/metadata snapshot mismatch and writes no sidecar or FBX", async () => {
  const h = mount("full", true);
  act(() => h.result.current.chooseSceneMode("original-selection"));
  await waitFor(() => expect(h.result.current.errorCode).toBe("SCENE_INTEGRITY"));
  expect(mock.save).not.toHaveBeenCalled();
});
it("a hand change during original prepare discards late FBX and metadata", async () => {
  const h = mount("no_candidates", false, true);
  act(() => h.result.current.confirmPartial());
  act(() => h.result.current.chooseSceneMode("original-selection"));
  await waitFor(() => expect(h.requests).toHaveLength(1));
  act(() =>
    h.qc.setQueryData(["hands", "owner", h.e.prepareResponse.manifest.jobId, 0], { revision: 2 }),
  );
  await act(async () => h.finish());
  await waitFor(() => expect(h.result.current.errorCode).toBe("PREVIEW_CHANGED"));
  expect(mock.save).not.toHaveBeenCalled();
  expect(h.requests).toHaveLength(1);
});
it("metadata storage unavailability needs an explicit individual fallback before any download", async () => {
  const h = mount("full");
  const job = h.e.prepareResponse.manifest.jobId;
  const data = h.qc.getQueryData<AnalysisResult>(poseQueryKeys.result(job))!;
  act(() =>
    h.qc.setQueryData(poseQueryKeys.result(job), {
      ...data,
      capabilities: {
        ...data.capabilities,
        sceneAvailability: {
          ...data.capabilities.sceneAvailability!,
          manifest: { available: false, reasons: ["receipt_storage_unavailable"] },
        },
      },
    }),
  );
  expect(h.result.current.needsIndividualConfirmation).toBe(true);
  expect(h.result.current.sceneUnavailableReason).toContain("구도 정보를 보관할 수 없어요");
  expect(mock.body).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
});
