import { GlobalShortcutError, type GlobalShortcutService } from "./globalShortcut.contract";

/**
 * 브라우저 개발 모드. 전역 단축키는 네이티브 기능이라 흉내 낼 수 없으므로
 * 등록을 시도하지 않고 UNSUPPORTED를 던진다. 호출부가 이를 받아 앱 내 대체 경로를
 * 켜고 화면에 "데스크톱 앱에서만" 상태를 표시한다.
 */
export const globalShortcutMock: GlobalShortcutService = {
  async register(): Promise<void> {
    throw new GlobalShortcutError(
      "UNSUPPORTED",
      "브라우저 개발 모드에서는 전역 단축키를 사용할 수 없습니다.",
    );
  },

  async unregister(): Promise<void> {
    // no-op
  },

  async focusMainWindow(): Promise<void> {
    // no-op
  },
};
