import { invoke } from "@tauri-apps/api/core";
import {
  GlobalShortcutError,
  type GlobalShortcutErrorCode,
  type GlobalShortcutService,
} from "./globalShortcut.contract";

const KNOWN_CODES: GlobalShortcutErrorCode[] = [
  "INVALID_ACCELERATOR",
  "REGISTER_FAILED",
  "UNREGISTER_FAILED",
  "UNSUPPORTED",
];

function toGlobalShortcutError(raw: unknown): GlobalShortcutError {
  // Rust command은 { code, message } 형태로 오류를 반환한다.
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    const code = (raw as { code: string }).code as GlobalShortcutErrorCode;
    const message = (raw as { message?: string }).message ?? "전역 단축키를 등록하지 못했습니다.";
    if (KNOWN_CODES.includes(code)) return new GlobalShortcutError(code, message);
  }
  return new GlobalShortcutError("REGISTER_FAILED", "전역 단축키를 등록하지 못했습니다.");
}

export const globalShortcutTauri: GlobalShortcutService = {
  async register(accelerator: string): Promise<void> {
    try {
      await invoke("register_capture_shortcut", { accelerator });
    } catch (err) {
      throw toGlobalShortcutError(err);
    }
  },

  async unregister(): Promise<void> {
    try {
      await invoke("unregister_capture_shortcut");
    } catch (err) {
      throw toGlobalShortcutError(err);
    }
  },

  async focusMainWindow(): Promise<void> {
    try {
      await invoke("focus_main_window");
    } catch {
      // 창을 앞으로 못 가져오는 것은 치명적이지 않다.
    }
  },
};
