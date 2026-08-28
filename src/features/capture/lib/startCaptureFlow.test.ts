import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 화면 기록 권한 거부가 사용자에게 도달하는지 고정한다.
 *
 * 0.1.1-beta에서는 권한이 없어도 캡처가 "성공"했다. macOS가 오류 대신 배경화면만
 * 담긴 이미지를 돌려줬기 때문이다(ADR-003 2026-08-28 정정). 이제 네이티브가
 * PERMISSION_DENIED를 던지므로, 그 코드가 store까지 남아 복구 안내를 붙일 수
 * 있는지가 회귀 지점이다. 메시지만 남기고 코드를 버리면 화면은 다시 아무것도
 * 안내하지 못한다.
 */
const capture = vi.hoisted(() => ({
  grabScreen: vi.fn(),
  openScreenRecordingSettings: vi.fn(async () => {}),
}));
const navigate = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../api/capture.service", () => ({ captureService: capture }));
vi.mock("@/app/router", () => ({
  router: { navigate, state: { location: { pathname: "/app/home" } } },
}));
vi.mock("@/features/analytics/analyticsClient", () => ({
  trackEvent: vi.fn(),
  currentSurface: () => "app",
}));

const { startCaptureFlow } = await import("./startCaptureFlow");
const { CaptureError } = await import("../api/capture.contract");
const { useCaptureStore } = await import("../store/captureStore");
const { useInstallationStore } = await import("@/features/installation/installationStore");

beforeEach(() => {
  capture.grabScreen.mockReset();
  useCaptureStore.getState().reset();
  useInstallationStore.setState({ status: "registered" });
});

afterEach(() => {
  useCaptureStore.getState().reset();
});

describe("startCaptureFlow", () => {
  it("권한 거부는 코드와 안내 문구를 함께 남긴다", async () => {
    capture.grabScreen.mockRejectedValue(new CaptureError("PERMISSION_DENIED", "권한 없음"));

    await startCaptureFlow();

    const state = useCaptureStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("PERMISSION_DENIED");
    expect(state.error).toContain("화면 기록");
    // 켜 놓고도 같은 증상을 다시 겪지 않도록 재실행 안내가 포함되어야 한다.
    expect(state.error).toContain("다시 실행");
  });

  it("다른 실패에는 권한 코드가 붙지 않는다", async () => {
    capture.grabScreen.mockRejectedValue(new CaptureError("CAPTURE_FAILED", "실패"));

    await startCaptureFlow();

    expect(useCaptureStore.getState().errorCode).toBe("CAPTURE_FAILED");
  });

  it("네이티브가 응답하지 않아도 진행 중에 묶이지 않는다", async () => {
    // grabbing에 묶이면 재진입 방지가 이후 클릭을 전부 삼켜 버튼이 죽은 것처럼 된다.
    // 그 상태에서는 오류도 안 뜨므로 사용자는 무엇이 잘못됐는지 알 길이 없다.
    vi.useFakeTimers();
    capture.grabScreen.mockReturnValue(new Promise(() => {}));

    const flow = startCaptureFlow();
    await vi.advanceTimersByTimeAsync(20_000);
    await flow;

    expect(useCaptureStore.getState().status).toBe("error");
    vi.useRealTimers();
  });

  it("성공하면 오류 상태가 남지 않는다", async () => {
    capture.grabScreen.mockResolvedValue({
      dataUrl: "data:image/png;base64,AA",
      width: 100,
      height: 100,
      monitor: { x: 0, y: 0, width: 100, height: 100 },
    });

    await startCaptureFlow();

    const state = useCaptureStore.getState();
    expect(state.status).toBe("selecting");
    expect(state.errorCode).toBeNull();
  });
});
