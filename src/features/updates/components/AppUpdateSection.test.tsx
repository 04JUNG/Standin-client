import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { historyQueryKeys } from "@/features/history/queryKeys";
import { useUpdateStore } from "../store/updateStore";

/**
 * 버전·업데이트 섹션의 계약을 고정한다(ADR-011).
 *
 * 특히 두 가지가 회귀하기 쉽다.
 * - 피드가 없는 빌드에서 "업데이트 확인" 버튼이 다시 나오는 것(CLAUDE.md §10).
 * - 분석이 도는 중에 설치 버튼이 열려 있는 것(docs/11 §1).
 */

const currentVersion = vi.fn();
const isConfigured = vi.fn();
const check = vi.fn();
const install = vi.fn();
const relaunch = vi.fn();

vi.mock("../api/update.service", () => ({
  updateService: {
    currentVersion: () => currentVersion(),
    isConfigured: () => isConfigured(),
    check: () => check(),
    install: (onProgress?: (progress: { ratio: number | null }) => void) => install(onProgress),
    relaunch: () => relaunch(),
  },
}));

const { AppUpdateSection } = await import("./AppUpdateSection");

/** 분석 Job이 도는 상황을 만든다. 끝나지 않는 쿼리 하나면 useIsFetching이 잡는다. */
function RunningAnalysis() {
  useQuery({
    queryKey: poseQueryKeys.result("job-1"),
    queryFn: () => new Promise(() => {}),
  });
  return null;
}

/** 작업 기록을 불러오는 상황. 분석과 달리 설치를 막으면 안 된다. */
function LoadingJobHistory() {
  useQuery({
    queryKey: historyQueryKeys.list(),
    queryFn: () => new Promise(() => {}),
  });
  return null;
}

function renderSection(extra?: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement("div", null, extra, createElement(AppUpdateSection)),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // 확인 결과가 store에 남으므로 테스트마다 지운다. 남기면 loadInfo가 조기 반환한다.
  useUpdateStore.getState().reset();
  currentVersion.mockResolvedValue("0.1.1-beta.2");
  isConfigured.mockResolvedValue(true);
});

describe("AppUpdateSection", () => {
  it("피드 설정과 무관하게 현재 버전을 보여준다", async () => {
    isConfigured.mockResolvedValue(false);
    renderSection();

    expect(await screen.findByText("Standin 0.1.1-beta.2")).toBeInTheDocument();
  });

  it("업데이트 피드가 없는 빌드에서는 확인 버튼 대신 안내를 보여준다", async () => {
    isConfigured.mockResolvedValue(false);
    renderSection();

    expect(await screen.findByText(/자동 업데이트를 사용하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업데이트 확인" })).not.toBeInTheDocument();
  });

  it("최신이면 최신이라고만 말한다", async () => {
    check.mockResolvedValue({ kind: "up-to-date" });
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));

    expect(await screen.findByText("최신 버전입니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /지금 설치/ })).not.toBeInTheDocument();
  });

  it("새 버전이 있으면 버전과 설치 버튼을 보여준다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2", notes: "캡처 오류 수정" });
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));

    expect(await screen.findByText(/새 버전 0\.1\.2/)).toBeInTheDocument();
    expect(screen.getByText("캡처 오류 수정")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지금 설치/ })).toBeEnabled();
  });

  it("분석이 진행 중이면 설치를 막고 이유를 밝힌다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    renderSection(createElement(RunningAnalysis));

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));

    expect(await screen.findByText(/분석이 진행 중입니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지금 설치/ })).toBeDisabled();
  });

  it("작업 기록 조회는 설치를 막지 않는다", async () => {
    // 기록 쿼리 키가 ["analysis"] 아래로 들어가면 목록을 볼 때마다 업데이트가 막힌다.
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    renderSection(createElement(LoadingJobHistory));

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));

    expect(await screen.findByText(/새 버전 0\.1\.2/)).toBeInTheDocument();
    expect(screen.queryByText(/분석이 진행 중입니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지금 설치/ })).toBeEnabled();
  });

  it("설치가 끝나면 재시작을 사용자가 고르게 한다", async () => {
    check.mockResolvedValue({ kind: "available", version: "0.1.2" });
    install.mockResolvedValue(undefined);
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));
    await userEvent.click(await screen.findByRole("button", { name: /지금 설치/ }));

    const restart = await screen.findByRole("button", { name: "지금 다시 시작" });
    expect(relaunch).not.toHaveBeenCalled();

    await userEvent.click(restart);
    await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1));
  });

  it("확인이 실패하면 조용히 넘기지 않는다", async () => {
    check.mockRejectedValue(new Error("업데이트 서버에 연결하지 못했습니다."));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "업데이트 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "업데이트 서버에 연결하지 못했습니다.",
    );
  });
});
