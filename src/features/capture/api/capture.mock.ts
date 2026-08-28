import type {
  CaptureService,
  ScreenFrame,
  ScreenPermissionStatus,
} from "./capture.contract";

/**
 * 브라우저(Vite) 개발용 Mock. Tauri가 없을 때 사용한다.
 * 선택·크롭 UI를 실제 Tauri 없이 검증할 수 있도록 플레이스홀더 프레임을 생성한다.
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const captureMock: CaptureService = {
  async grabScreen(): Promise<ScreenFrame> {
    await delay(300);
    const w = Math.round(window.screen.width || 1280);
    const h = Math.round(window.screen.height || 800);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context 없음");

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#8ed8e8");
    grad.addColorStop(1, "#152238");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let x = 0; x < w; x += 80) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 80) ctx.fillRect(0, y, w, 1);

    ctx.fillStyle = "#ffffff";
    ctx.font = "24px sans-serif";
    ctx.fillText("MOCK 화면 캡처 프레임 — 영역을 드래그하세요", 48, 64);

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: w,
      height: h,
      // 브라우저에는 모니터 개념이 없다. 화면 하나가 원점에 있다고 본다 —
      // 어차피 창 조작이 no-op이라 이 값은 쓰이지 않는다.
      monitor: { x: 0, y: 0, width: w, height: h },
    };
  },

  // 브라우저에는 열 시스템 설정이 없다.
  async openScreenRecordingSettings(): Promise<void> {},

  // 브라우저에는 화면 기록 권한 개념이 없다. 온보딩 단계도 건너뛴다.
  async screenPermissionStatus(): Promise<ScreenPermissionStatus> {
    return "not_required";
  },

  async requestScreenPermission(): Promise<ScreenPermissionStatus> {
    return "not_required";
  },

  // 브라우저에서는 다시 시작할 프로세스가 없다.
  async relaunchApp(): Promise<void> {},
};
