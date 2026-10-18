import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PoseViewerPage } from "./PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { poseQueryKeys } from "../queryKeys";
import type { AnalysisResult } from "../api/pose.contract";

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
  usePoseSelectionStore.getState().startJob("click-test", null);
  usePoseSelectionStore.setState({ selectedByPerson: {}, excludedPeople: {} });
  useUploadStore
    .getState()
    .setDraft({
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

it.each(["app", "bar"])(
  "%s: all five images select immediately, including when presentation metadata is present",
  (mode) => {
    const client = new QueryClient();
    const data: AnalysisResult = {
      jobId: "job-click",
      capabilities: {
        refine: false,
        fbxExport: true,
        characterSelection: false,
        bodyPreviews: false,
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
