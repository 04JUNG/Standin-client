import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { upstreamAnalysisFailure } from "@/shared/api/analysisJobFailure";
import { AnalysisError } from "../api/pose.contract";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { PoseViewerPage } from "./PoseViewerPage";

const state = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("../hooks/useAnalysisResult", () => ({
  useAnalysisResult: () => ({
    isPending: false,
    isError: true,
    error: state.error,
    sourceFile: new File(["image"], "rough.png"),
    draft: {},
    people: [],
    selectablePeople: [],
    failedPeople: [],
    selectedByPerson: {},
    selectedCount: 0,
    allSelected: false,
    // 화면은 오류 안내보다 먼저 체형·인물 포함 상태를 읽는다(훅은 항상 이 값들을 준다).
    bodies: { enabled: false, ready: true, entries: [] },
    restoreOnly: false,
    includedPeople: [],
    pendingPeople: [],
    excludedPeople: [],
    setPersonIncluded: () => {},
    confirmedSelections: [],
  }),
}));
vi.mock("../hooks/usePoseViewerShortcuts", () => ({ usePoseViewerShortcuts: () => {} }));
vi.mock("@/features/history/hooks/useJobSelections", () => ({ useJobSelections: () => ({}) }));
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

beforeEach(() => usePoseSelectionStore.getState().setJobId("client-test"));
afterEach(cleanup);

describe.each(["app", "bar"])("%s 오류 화면", (mode) => {
  it.each([
    ["ANALYSIS_DAILY_QUOTA_EXHAUSTED", false],
    ["ANALYSIS_RATE_LIMITED", true],
    ["ANALYSIS_UNAVAILABLE", true],
    ["ANALYSIS_UPSTREAM_TIMEOUT", true],
    ["ANALYSIS_UPSTREAM_ERROR", true],
  ])("%s의 문구와 재시도 버튼", (code, retryable) => {
    const guidance = upstreamAnalysisFailure(code)!;
    state.error = new AnalysisError(guidance.code, guidance.message);
    render(
      <MemoryRouter initialEntries={["/app/jobs/client-test"]}>
        <Routes>
          <Route
            path="/app/jobs/:jobId"
            element={mode === "app" ? <PoseViewerPage /> : <BarCandidatesPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(guidance.message)).toBeInTheDocument();
    if (retryable) expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    if (mode === "app" || !retryable) {
      expect(
        screen.getByRole("button", { name: mode === "app" ? "홈으로 돌아가기" : "처음으로" }),
      ).toBeInTheDocument();
    }
  });
});
