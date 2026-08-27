import { invoke } from "@tauri-apps/api/core";
import {
  CaptureError,
  type CaptureErrorCode,
  type CaptureService,
  type ScreenFrame,
} from "./capture.contract";

type RawFrame = {
  dataUrl: string;
  width: number;
  height: number;
  monitor: { x: number; y: number; width: number; height: number };
};

const KNOWN_CODES: CaptureErrorCode[] = [
  "CANCELLED",
  "PERMISSION_DENIED",
  "CAPTURE_FAILED",
  "SAVE_FAILED",
  "UNSUPPORTED",
];

function toCaptureError(raw: unknown): CaptureError {
  // Rust command은 { code, message } 형태로 오류를 반환한다.
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    const code = (raw as { code: string }).code as CaptureErrorCode;
    const message = (raw as { message?: string }).message ?? "화면 캡처에 실패했습니다.";
    if (KNOWN_CODES.includes(code)) return new CaptureError(code, message);
  }
  return new CaptureError("CAPTURE_FAILED", "화면 캡처에 실패했습니다.");
}

export const captureTauri: CaptureService = {
  async grabScreen(): Promise<ScreenFrame> {
    try {
      const frame = await invoke<RawFrame>("grab_screen");
      return frame;
    } catch (err) {
      throw toCaptureError(err);
    }
  },

  async openScreenRecordingSettings(): Promise<void> {
    // 실패해도 사용자가 할 수 있는 일이 없다. 안내 문구에 설정 경로가 이미 적혀 있으므로
    // 오류를 다시 띄우기보다 조용히 넘긴다.
    try {
      await invoke("open_screen_recording_settings");
    } catch {
      /* noop */
    }
  },
};
