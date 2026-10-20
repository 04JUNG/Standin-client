import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTourStore } from "@/shared/stores/tourStore";
import { safeStorage } from "@/shared/lib/safeStorage";
import { useUpdateStore } from "../store/updateStore";
import { SEEN_RELEASE_KEY, useReleaseNotesStore } from "../lib/releaseNotes";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";

vi.mock("@/features/installation/installationStore", () => ({
  useInstallationStore: (select: (state: { status: string }) => unknown) =>
    select({ status: "registered" }),
}));
vi.mock("../hooks/useUpdateBlockReason", () => ({
  useUpdateBlockReason: () => ({ reason: null, readReason: () => null }),
}));

function show(path = "/app/home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReleaseNotesDialog />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  safeStorage.removeItem(SEEN_RELEASE_KEY);
  useUpdateStore.setState({ version: "0.1.1-beta.9", configured: true });
  useReleaseNotesStore.getState().closeHistory();
  useTourStore.setState({ active: false, completedAt: null, dismissedAt: "2026-10-19T00:00:00Z" });
});

describe("ReleaseNotesDialog", () => {
  it("처음에는 소개로 보여주고 확인 후 재마운트해도 반복하지 않는다", async () => {
    const view = show();
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("이번 버전 소개");
    expect(screen.getByText("자동 업데이트와 변경 내역 안내")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(safeStorage.getItem(SEEN_RELEASE_KEY)).toBe("0.1.1-beta.9");
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
    safeStorage.setItem(SEEN_RELEASE_KEY, "0.1.1-beta.9");
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
});
