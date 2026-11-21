import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  action: "choose",
  retry: vi.fn(),
  switchSkin: undefined as (() => void) | undefined,
  retryUseless: false,
}));
vi.mock("../hooks/useFramedReview", () => ({
  useFramedReview: () => ({
    items: [
      {
        personIndex: 0,
        candidate: { title: "새로 만든 포즈" },
        previewUrl: "",
        onModelStatus: vi.fn(),
      },
    ],
    hands: { enabled: false },
    isRefining: false,
    previewLoading: false,
    preparationError: true,
    downloadReady: false,
    downloadLabel: "포즈 다운로드",
    previewError: true,
    previewFailure: {
      action: mock.action,
      message: "선택한 포즈를 확인하지 못했어요.",
      label: mock.action === "choose" ? "후보 다시 고르기" : "다시 시도",
      switchToDefaultSkin: mock.switchSkin,
      retryUseless: mock.retryUseless,
    },
    retryPreview: mock.retry,
  }),
}));
vi.mock("../components/ReviewPosePreview", () => ({ ReviewPosePreview: () => <div /> }));
vi.mock("@/shared/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/bar/components/BarShell", () => ({
  BarShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../store/poseSelectionStore", () => ({ usePoseSelectionStore: () => "job" }));
import { ReviewPage } from "./ReviewPage";
import { BarReviewPage } from "@/features/bar/pages/BarReviewPage";
function Location() {
  return <p>{useLocation().pathname}</p>;
}
beforeEach(() => {
  mock.action = "choose";
  mock.retry.mockClear();
  mock.switchSkin = undefined;
  mock.retryUseless = false;
});
function renderReview(surface: string) {
  render(
    <MemoryRouter initialEntries={[surface === "app" ? "/app/jobs/job/review" : "/bar/review"]}>
      <Routes>
        <Route path="/app/jobs/:jobId/review" element={<ReviewPage />} />
        <Route path="/bar/review" element={<BarReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it.each(["app", "bar"])(
  "%s review blocks save and returns to candidates for unavailable sources",
  (surface) => {
    const path = surface === "app" ? "/app/jobs/job/review" : "/bar/review";
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/jobs/:jobId/review" element={<ReviewPage />} />
          <Route path="/bar/review" element={<BarReviewPage />} />
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("선택한 포즈를 확인하지 못했어요");
    expect(screen.getByRole("button", { name: /포즈 다운로드/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "후보 다시 고르기" })[0]!);
    expect(
      screen.getByText(surface === "app" ? "/app/jobs/job" : "/bar/candidates"),
    ).toBeInTheDocument();
    expect(mock.retry).not.toHaveBeenCalled();
  },
);
it.each(["app", "bar"])("%s review retries temporary conversion errors", (surface) => {
  mock.action = "retry";
  const path = surface === "app" ? "/app/jobs/job/review" : "/bar/review";
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/jobs/:jobId/review" element={<ReviewPage />} />
        <Route path="/bar/review" element={<BarReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mock.retry).toHaveBeenCalledOnce();
});
it.each(["app", "bar"])(
  "%s review switches an unsupported skin to default instead of a useless retry",
  (surface) => {
    mock.action = "retry";
    mock.switchSkin = vi.fn();
    mock.retryUseless = true;
    renderReview(surface);
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기본 스킨으로 바꾸기" }));
    expect(mock.switchSkin).toHaveBeenCalledOnce();
    expect(mock.retry).not.toHaveBeenCalled();
  },
);
it.each(["app", "bar"])(
  "%s review offers both the default skin and a retry for a skin outage",
  (surface) => {
    mock.action = "retry";
    mock.switchSkin = vi.fn();
    renderReview(surface);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mock.retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "기본 스킨으로 바꾸기" }));
    expect(mock.switchSkin).toHaveBeenCalledOnce();
  },
);
