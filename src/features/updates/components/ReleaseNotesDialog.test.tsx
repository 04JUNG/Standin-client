import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useTourStore } from "@/shared/stores/tourStore";
import { safeStorage } from "@/shared/lib/safeStorage";
import { useUpdateStore } from "../store/updateStore";
import { releases, SEEN_RELEASE_KEY, useReleaseNotesStore } from "../lib/releaseNotes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@/features/installation/installationStore", () => ({
  useInstallationStore: (select: (state: { status: string }) => unknown) =>
    select({ status: "registered" }),
}));
vi.mock("../hooks/useUpdateBlockReason", () => ({
  useUpdateBlockReason: () => ({ reason: null, readReason: () => null }),
}));

const currentRelease = releases[releases.length - 1];

function show(path = "/app/home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReleaseNotesDialog />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(invoke).mockReset();
  safeStorage.removeItem(SEEN_RELEASE_KEY);
  useUpdateStore.setState({ version: currentRelease.version, configured: true });
  useReleaseNotesStore.getState().closeHistory();
  useTourStore.setState({ active: false, completedAt: null, dismissedAt: "2026-10-19T00:00:00Z" });
});

describe("ReleaseNotesDialog", () => {
  it("기존 beta에서 최신 오픈베타로 갱신한 변경 내역을 보여준다", async () => {
    safeStorage.setItem(SEEN_RELEASE_KEY, "0.1.1-beta.8");
    show();
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      `Standin ${currentRelease.version} 업데이트 완료`,
    );
    expect(screen.getByText(currentRelease.title)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBe(currentRelease.version);
  });
  it("처음에는 소개로 보여주고 확인 후 재마운트해도 반복하지 않는다", async () => {
    const view = show();
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("이번 버전 소개");
    expect(screen.getByText(currentRelease.title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBe(currentRelease.version);
    view.unmount();
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("투어 중에는 미루고 투어가 끝난 뒤 표시한다", async () => {
    useTourStore.setState({ active: true });
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => useTourStore.setState({ active: false }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("작업 화면에서는 자동으로 열지 않고 설정에서 다시 열 수 있다", async () => {
    safeStorage.setItem(SEEN_RELEASE_KEY, currentRelease.version);
    show("/app/settings");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => useReleaseNotesStore.getState().requestHistory());
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("변경 내역");
  });

  it("다른 모달이 닫힐 때까지 기다린다", async () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.textContent = "기존 대화상자";
    document.body.appendChild(other);
    show();
    expect(screen.queryByText("이번 버전 소개")).not.toBeInTheDocument();
    other.remove();
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("이번 버전 소개"));
  });
  it("디스크 저장을 마친 뒤 닫고 실패하면 팝업에서 재시도할 수 있다", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValueOnce(null);
    show();
    await screen.findByRole("dialog");
    vi.mocked(invoke).mockRejectedValueOnce(new Error("disk full"));
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("확인 기록을 저장하지 못했습니다");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    let finish!: (version: string) => void;
    vi.mocked(invoke).mockReturnValueOnce(new Promise<string>((resolve) => (finish = resolve)));
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.getByRole("button", { name: "확인" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => finish(currentRelease.version));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
