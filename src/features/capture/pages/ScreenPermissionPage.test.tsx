import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * 온보딩 권한 단계가 실제로 프롬프트를 띄우고, 거부 뒤에는 설정으로 보내는지 고정한다.
 *
 * 이 화면의 존재 이유는 재실행 비용을 앞당기는 것이다(ADR-003 2026-08-28 정정). 권한이
 * 이미 있는데도 단계를 띄우거나, 프롬프트가 닫힌 뒤 복구 경로가 없으면 목적을 잃는다.
 */
const capture = vi.hoisted(() => ({
  screenPermissionStatus: vi.fn(),
  requestScreenPermission: vi.fn(),
  openScreenRecordingSettings: vi.fn(async () => {}),
}));

vi.mock("../api/capture.service", () => ({ captureService: capture }));

const { ScreenPermissionPage } = await import("./ScreenPermissionPage");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/screen-permission"]}>
      <Routes>
        <Route path="/app/screen-permission" element={<ScreenPermissionPage />} />
        <Route path="/app/home" element={<div>홈</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  capture.screenPermissionStatus.mockReset();
  capture.requestScreenPermission.mockReset();
  capture.openScreenRecordingSettings.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ScreenPermissionPage", () => {
  it("권한 개념이 없는 플랫폼에서는 단계를 건너뛴다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("not_required");
    renderPage();
    expect(await screen.findByText("홈")).toBeInTheDocument();
  });

  it("이미 허용된 상태에서는 단계를 건너뛴다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("granted");
    renderPage();
    expect(await screen.findByText("홈")).toBeInTheDocument();
  });

  it("화면을 여는 것만으로 프롬프트가 뜨지 않는다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("denied");
    renderPage();
    await screen.findByRole("button", { name: "권한 허용하기" });
    expect(capture.requestScreenPermission).not.toHaveBeenCalled();
  });

  it("버튼을 눌러야 프롬프트가 뜨고, 거부되면 설정 경로를 준다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("denied");
    // 프롬프트가 떠도 사용자가 아직 응답하지 않았으면 denied가 돌아온다.
    capture.requestScreenPermission.mockResolvedValue("denied");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "권한 허용하기" }));

    expect(capture.requestScreenPermission).toHaveBeenCalledTimes(1);
    const settings = await screen.findByRole("button", { name: "시스템 설정 열기" });
    await userEvent.click(settings);
    expect(capture.openScreenRecordingSettings).toHaveBeenCalledTimes(1);
  });

  it("허용되면 홈으로 넘어간다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("denied");
    capture.requestScreenPermission.mockResolvedValue("granted");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "권한 허용하기" }));

    await waitFor(() => expect(screen.getByText("홈")).toBeInTheDocument());
  });

  it("나중에 하기로 홈에 갈 수 있다", async () => {
    capture.screenPermissionStatus.mockResolvedValue("denied");
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "나중에 하기" }));

    expect(await screen.findByText("홈")).toBeInTheDocument();
  });
});
