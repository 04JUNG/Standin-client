import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { exampleSnapshot, previewCandidates } from "@/dev/analysis-progress-fixture";
import { readAnalysisProgress } from "../api/analysisProgress";
import type { AnalysisResult, PoseResultService } from "../api/pose.contract";
import { PoseViewerPage } from "./PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";

const transport = vi.hoisted(() => ({ analyze: vi.fn(), loadResult: vi.fn() }));
vi.mock("../api/pose.service", () => ({ poseService: transport }));
// Native window controls and the model picker are outside this route/data-flow test.
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <div>
      <main data-bar-scroll>{children}</main>
      {footer}
    </div>
  ),
}));
vi.mock("@/features/models/components/ModelSelect", () => ({ ModelSelect: () => null }));

let client: QueryClient;
beforeEach(() => {
  transport.analyze.mockReset();
  transport.loadResult.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline test")));
  useUploadStore.setState({
    draft: {
      id: "loading-rough",
      source: "file",
      file: new File(["rough"], "rough.png", { type: "image/png" }),
      previewUrl: "data:image/png;base64,",
      originalName: "rough.png",
      mimeType: "image/png",
      width: 250,
      height: 315,
      sizeBytes: 5,
      createdAt: "2026-11-06T00:00:00Z",
    },
  });
  usePoseSelectionStore.getState().clearSelection();
});
afterEach(() => {
  client.clear();
  useUploadStore.setState({ draft: null });
  usePoseSelectionStore.getState().clearSelection();
  vi.unstubAllGlobals();
});

function resultFixture(surface: string): AnalysisResult {
  return {
    jobId: `job_loading_${surface}`,
    capabilities: { refine: false, fbxExport: false, characterSelection: false },
    people: [
      {
        index: 0,
        confidence: "high",
        skeletonState: "valid",
        skeletonSource: "full_image",
        coverageClass: "full",
        fallbackMode: "none",
        refineAllowed: false,
        refinableLimbs: [],
        candidates: previewCandidates.map((candidate) => ({
          ...candidate,
          poseId: candidate.id,
          title: `포즈 후보 ${candidate.rank}`,
          tags: [],
          matchLevel: "high",
          previewImages: [],
          bvhAvailable: true,
        })),
      },
    ],
  };
}

function SurfaceSwitch({ appRoute }: { appRoute: string }) {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(appRoute)}>테스트 앱 전환</button>
      <button onClick={() => navigate("/bar/candidates")}>테스트 바 전환</button>
    </>
  );
}

describe("production loading routes", () => {
  it.each(["app", "bar"] as const)(
    "%s receives real progress, preserves one job across routes, and exposes Top5 during the handoff",
    async (surface) => {
      let report: Parameters<PoseResultService["analyze"]>[0]["onProgress"];
      let finish: (value: AnalysisResult) => void = () => {};
      transport.analyze.mockImplementation(
        ({ onProgress }: Parameters<PoseResultService["analyze"]>[0]) => {
          report = onProgress;
          onProgress?.("uploading");
          return new Promise<AnalysisResult>((resolve) => {
            finish = resolve;
          });
        },
      );
      const job = `loading-route-${surface}`;
      usePoseSelectionStore.getState().setJobId(job);
      const appRoute = `/app/jobs/${job}`;
      const view = render(
        <QueryClientProvider client={client}>
          <MemoryRouter
            initialEntries={[surface === "app" ? appRoute : "/bar/candidates"]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <SurfaceSwitch appRoute={appRoute} />
            <Routes>
              <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
              <Route path="/bar/candidates" element={<BarCandidatesPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(transport.analyze).toHaveBeenCalledOnce());
      const snapshot = readAnalysisProgress(exampleSnapshot("searching"))!;
      act(() => report?.("searching", snapshot));
      await waitFor(() =>
        expect(view.container.querySelector('[data-stage="searching"]')).toBeInTheDocument(),
      );
      expect(view.container.querySelectorAll("[data-candidate-id]")).toHaveLength(5);
      expect(view.container.querySelector(".pose-loading__scene-facts")).toHaveTextContent(
        "전신·반신",
      );
      expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "100");
      if (surface === "bar") {
        fireEvent.click(screen.getByRole("button", { name: "테스트 앱 전환" }));
        await waitFor(() =>
          expect(view.container.querySelector('[data-stage="searching"]')).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole("button", { name: "테스트 바 전환" }));
        await waitFor(() =>
          expect(
            view.container.querySelector('.pose-loading--compact[data-stage="searching"]'),
          ).toBeInTheDocument(),
        );
        expect(transport.analyze).toHaveBeenCalledOnce();
      }
      await act(async () => {
        finish(resultFixture(surface));
      });
      await waitFor(() =>
        expect(view.container.querySelectorAll("[data-pose-candidate]")).toHaveLength(5),
      );
      expect(view.container.querySelector(".analysis-transition__outgoing")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(
        view.container.querySelector('[data-completed="true"] .pose-loading__percent'),
      ).toHaveTextContent("100%");
      fireEvent.click(view.container.querySelectorAll("[data-pose-candidate]")[2]);
      expect(usePoseSelectionStore.getState().selectedByPerson[0]).toBe(previewCandidates[2].id);
      expect(transport.analyze).toHaveBeenCalledOnce();
      expect(transport.loadResult).not.toHaveBeenCalled();
      view.unmount();
    },
  );
});
