import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
vi.mock("../hooks/useFramedReview", () => ({
  useFramedReview: () => ({
    items: [
      {
        personIndex: 0,
        candidate: { title: "선택한 포즈" },
        outlineAvailable: true,
        outlineWidth: 2,
        skinAvailable: true,
        skin: { version: "fbx-skin-v1", id: "flesh-muscle" },
        supportedSkins: ["default", "flesh", "flesh-muscle"],
      },
    ],
    hands: { enabled: false },
    downloadReady: true,
    downloadLabel: "포즈 다운로드",
  }),
}));
vi.mock("../components/ReviewPosePreview", () => ({
  ReviewPosePreview: () => <div>최종 포즈</div>,
}));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../store/poseSelectionStore", () => ({ usePoseSelectionStore: () => "job" }));
import { ReviewPage } from "./ReviewPage";
import { BarReviewPage } from "@/features/bar/pages/BarReviewPage";
afterEach(cleanup);
it.each(["app", "bar"])(
  "%s final review has no skin or outline editing even when every control is available",
  (mode) => {
    render(
      <MemoryRouter initialEntries={[mode === "app" ? "/app/jobs/job/review" : "/bar/review"]}>
        <Routes>
          <Route path="/app/jobs/:jobId/review" element={<ReviewPage />} />
          <Route path="/bar/review" element={<BarReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("최종 포즈")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /살색|가이드선|근육선/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /포즈 다운로드/ })).toBeEnabled();
  },
);
