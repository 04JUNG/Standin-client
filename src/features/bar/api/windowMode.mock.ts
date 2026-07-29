import type { WindowModeService } from "./windowMode.contract";

/**
 * 브라우저 개발 모드. 창 조작은 네이티브 기능이라 흉내 내지 않는다.
 * UI는 그대로 렌더되므로 /bar/* 라우트로 바 레이아웃을 브라우저에서 개발할 수 있다.
 */
export const windowModeMock: WindowModeService = {
  async setMode(): Promise<void> {
    // no-op
  },
  async getPosition() {
    return null;
  },
  async setPosition(): Promise<void> {
    // no-op
  },
  async startDragging(): Promise<void> {
    // no-op
  },
  async control(): Promise<void> {
    // no-op
  },
};
