import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PoseViewerPage } from "./PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { getManifest } from "@/features/body-selection/api";
import { poseQueryKeys } from "../queryKeys";
import type { AnalysisResult } from "../api/pose.contract";

const bodySelection = vi.hoisted(() => ({
  schemaVersion: "body-selection.v1",
  personIndex: 0,
  intent: "manual",
  manualCharacterId: "female-new",
  recommendation: { status: "disabled", body: null, reasonCodes: [] },
  resolvedBody: {
    characterId: "female-new",
    bodyId: "female",
    bodyVersion: "v1",
    assetSha256: "b".repeat(64),
    rigVersion: "v1",
    measurementVersion: "v1",
  },
  resolvedSource: "manual",
  resolutionStatus: "ready",
  selectionRevision: 2,
  shape: { schemaVersion: "body-shape.v1", controls: { height: 168 }, shapeSha256: "c".repeat(64) },
}));
vi.mock("@/features/body-selection/api", async (original) => ({
  ...(await original<typeof import("@/features/body-selection/api")>()),
  getSelection: vi.fn(async () => bodySelection),
  getManifest: vi.fn(async () => ({
    candidates: Array.from({ length: 5 }, (_, i) => ({ candidateId: `pick-${i}` })),
  })),
  renderBodyCandidate: vi.fn(async (_m, c) => `data:image/png;base64,${btoa(c.candidateId)}`),
  getOptions: vi.fn(async () => ({
    characters: [{ characterId: "female-new", displayName: "테스트 여성" }],
  })),
  getPreferences: vi.fn(async () => ({ cards: [] })),
}));
vi.mock("@/features/models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ data: { characters: [] } }),
}));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
  confirmSelections: vi.fn(),
}));
vi.mock("@/features/models/components/ModelSelect", () => ({ ModelSelect: () => null }));
vi.mock("@/features/hand-selection/ReferenceHands", () => ({ ReferenceHands: () => null }));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

beforeEach(() => {
  useInstallationStore.setState({ credentials: null });
  vi.mocked(getManifest).mockClear();
  usePoseSelectionStore.getState().startJob("click-test", null);
  usePoseSelectionStore.setState({ selectedByPerson: {}, excludedPeople: {} });
  useUploadStore.getState().setDraft({
    id: "rough",
    source: "file",
    file: new File(["png"], "rough.png"),
    previewUrl: "",
    originalName: "rough.png",
    mimeType: "image/png",
    width: 100,
    height: 100,
    createdAt: "",
  });
});

it.each([
  ["app", false],
  ["bar", false],
  ["app", true],
  ["bar", true],
] as const)(
  "%s body=%s: all five images select immediately without an enlargement dialog",
  async (mode, bodyMode) => {
    if (bodyMode)
      useInstallationStore.setState({
        credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
      });
    const client = new QueryClient();
    const data: AnalysisResult = {
      jobId: "job-click",
      capabilities: {
        refine: false,
        fbxExport: true,
        characterSelection: false,
        bodyPreviews: bodyMode,
        presentationBodyPreviews: bodyMode,
      },
      people: [
        {
          index: 0,
          confidence: "low",
          skeletonState: "valid",
          skeletonSource: "full_image",
          coverageClass: "full",
          fallbackMode: "soft",
          refineAllowed: false,
          refinableLimbs: [],
          posePresentation: {
            version: "dynamic-pose-presentation-v1",
            person_index: 0,
            route: "hybrid",
            status: "ready",
            search_status: "ok",
            search_reason: null,
            generation_status: null,
            generation_reason: null,
            output_scope: "full",
            unobserved_body_is_default: null,
            library_candidates: [],
            review_candidates: [],
            generated_candidates: [],
            basic_model: null,
            issues: [],
            preview_status: "ready",
            auto_apply_allowed: false,
            refine_allowed: false,
            export_allowed: false,
          },
          candidates: Array.from({ length: 5 }, (_, i) => ({
            id: `pick-${i}`,
            poseId: `pose-${i}`,
            rank: i + 1,
            title: `포즈 ${i + 1}`,
            tags: [],
            matchLevel: "medium",
            thumbnailUrl: "data:image/png;base64,AA==",
            previewImages: [],
            bvhAvailable: true,
            source: "library",
            lookupAllowed: true,
            releaseAllowed: true,
            sourceBvhSha256: "a".repeat(64),
          })),
        },
      ],
    };
    client.setQueryData(poseQueryKeys.result("click-test"), data);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/jobs/click-test"]}>
          <Routes>
            <Route
              path="/app/jobs/:jobId"
              element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByAltText("포즈 1");
    if (bodyMode) {
      await waitFor(() => expect(getManifest).toHaveBeenCalled());
      expect(vi.mocked(getManifest).mock.calls[0][2]).toMatchObject({
        resolvedBody: { characterId: "female-new" },
        shape: { controls: { height: 168 } },
      });
      expect(screen.getByAltText("포즈 1")).toHaveAttribute(
        "src",
        `data:image/png;base64,${btoa("pick-0")}`,
      );
    }
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByAltText(`포즈 ${i + 1}`));
      expect(usePoseSelectionStore.getState().selectedByPerson[0]).toBe(`pick-${i}`);
      expect(screen.getByAltText(`포즈 ${i + 1}`).closest("button")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    expect(screen.getByRole("button", { name: /이 포즈 사용/ })).toBeEnabled();
  },
);
