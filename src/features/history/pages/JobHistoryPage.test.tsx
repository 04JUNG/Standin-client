import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import type { JobHistoryItem } from "../api/history.contract";

const list = vi.fn();
const remove = vi.fn();
vi.mock("../api/history.service", () => ({
  historyService: {
    list: (...args: unknown[]) => list(...args),
    remove: (...args: unknown[]) => remove(...args),
    selections: vi.fn(),
  },
}));

// 썸네일은 인증이 필요한 경로라 blob으로 받는다. 화면 테스트에서는 대상이 아니다.
vi.mock("../hooks/useAuthedImage", () => ({ useAuthedImage: () => null }));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const { JobHistoryPage } = await import("./JobHistoryPage");

function itemFixture(overrides: Partial<JobHistoryItem> = {}): JobHistoryItem {
  return {
    jobId: "job_00000000-0000-4000-8000-000000000001",
    status: "completed",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    errorCode: null,
    source: "capture",
    personCount: 2,
    selectionCount: 2,
    hasSelection: true,
    thumbnailUrl: null,
    inputAvailable: true,
    inputWidth: 1920,
    inputHeight: 1080,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, children),
    );
  }
  return render(createElement(JobHistoryPage), { wrapper: Wrapper });
}

describe("JobHistoryPage", () => {
  beforeEach(() => {
    list.mockReset();
    remove.mockReset();
    navigate.mockReset();
  });

  it("기록이 없으면 새 분석으로 안내한다", async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    expect(await screen.findByText("아직 분석한 작업이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 분석 시작" })).toBeInTheDocument();
  });

  it("조회에 실패하면 빈 목록이 아니라 오류와 재시도를 보여준다", async () => {
    // 서버가 단일 진실 공급원이라 로컬 캐시가 없다. 빈 목록으로 보이면 "작업이
    // 지워졌다"로 읽힌다.
    list.mockRejectedValue(new ApiError(500, "SERVER_ERROR", "boom"));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    list.mockResolvedValue({ items: [itemFixture()], nextCursor: null });
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("완료 항목을 열면 서버 jobId를 그대로 라우트에 쓴다", async () => {
    const item = itemFixture();
    list.mockResolvedValue({ items: [item], nextCursor: null });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /인물 2명/ }));

    expect(navigate).toHaveBeenCalledWith(`/app/jobs/${item.jobId}`);
  });

  it("실패한 작업은 열 수 없고 사유를 밝힌다", async () => {
    list.mockResolvedValue({
      items: [
        itemFixture({
          status: "failed",
          errorCode: "ANALYSIS_UNAVAILABLE",
          personCount: 0,
          selectionCount: 0,
          hasSelection: false,
        }),
      ],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText("실패")).toBeInTheDocument();
    // 상류 혼잡은 "다른 이미지로"가 아니라 "같은 이미지로 다시"가 맞는 안내다.
    expect(screen.getByText(/같은 이미지로 다시 시도/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("삭제는 확인을 거친 뒤에만 실행된다", async () => {
    const item = itemFixture();
    list.mockResolvedValue({ items: [item], nextCursor: null });
    remove.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /작업 삭제$/ }));
    expect(remove).not.toHaveBeenCalled();

    expect(await screen.findByText("이 작업을 삭제할까요?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith({ jobId: item.jobId }));
  });

  it("다음 페이지가 있을 때만 더 보기를 낸다", async () => {
    list.mockResolvedValueOnce({ items: [itemFixture()], nextCursor: "cursor-2" });
    renderPage();

    const more = await screen.findByRole("button", { name: "더 보기" });

    list.mockResolvedValueOnce({
      items: [itemFixture({ jobId: "job_00000000-0000-4000-8000-000000000002" })],
      nextCursor: null,
    });
    await userEvent.click(more);

    await waitFor(() => expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull());
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-2" }));
  });
});
