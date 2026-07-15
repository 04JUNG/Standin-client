import { invoke } from "@tauri-apps/api/core";
import {
  CaptureError,
  type CaptureErrorCode,
  type CaptureService,
  type ScreenFrame,
} from "./capture.contract";

type RawFrame = { dataUrl: string; width: number; height: number };

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
};
