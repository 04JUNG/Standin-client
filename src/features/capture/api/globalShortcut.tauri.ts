import { invoke } from "@tauri-apps/api/core";
import {
  GlobalShortcutError,
  type GlobalShortcutErrorCode,
  type GlobalShortcutService,
} from "./globalShortcut.contract";

const ERROR_MESSAGES: Record<GlobalShortcutErrorCode, string> = {
  INVALID_ACCELERATOR: "이 키 조합은 캡처 단축키로 쓸 수 없어요. 다른 키를 골라 주세요.",
  REGISTER_FAILED: "캡처 단축키를 설정하지 못했어요. 다른 키를 골라 다시 시도해 주세요.",
  UNREGISTER_FAILED: "이전 캡처 단축키를 해제하지 못했어요. 앱을 다시 열고 시도해 주세요.",
  UNSUPPORTED: "이 환경에서는 캡처 단축키를 쓸 수 없어요. 설치한 앱에서 사용해 주세요.",
};

function toGlobalShortcutError(raw: unknown): GlobalShortcutError {
  // Rust command은 { code, message } 형태로 오류를 반환한다.
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    const code = (raw as { code: string }).code as GlobalShortcutErrorCode;
    if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code))
      return new GlobalShortcutError(code, ERROR_MESSAGES[code]);
  }
  return new GlobalShortcutError(
    "REGISTER_FAILED",
    "다른 프로그램에서 쓸 캡처 단축키를 설정하지 못했어요.",
  );
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
