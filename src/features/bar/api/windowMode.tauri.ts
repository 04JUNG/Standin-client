import { invoke } from "@tauri-apps/api/core";
import type {
  WindowControlAction,
  WindowMode,
  WindowModeService,
  WindowPosition,
  WindowSize,
} from "./windowMode.contract";

/**
 * 창 조작 실패는 치명적이지 않다. 모드 전환이 실패해도 라우팅은 이미 일어났으므로
 * 화면 내용은 맞고 창 크기만 어긋난다 — 앱을 막지 않고 조용히 넘어간다.
 */
export const windowModeTauri: WindowModeService = {
  async setMode(mode: WindowMode, size?: WindowSize): Promise<void> {
    try {
      await invoke("set_window_mode", {
        req: { mode, width: size?.width, height: size?.height },
      });
    } catch {
      // 무시.
    }
  },

  async getPosition(): Promise<WindowPosition | null> {
    try {
      return await invoke<WindowPosition>("get_window_position");
    } catch {
      return null;
    }
  },

  async setPosition(position: WindowPosition, size: WindowSize): Promise<void> {
    try {
      await invoke("set_window_position", {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      });
    } catch {
      // 무시.
    }
  },

  async startDragging(): Promise<void> {
    try {
      // capabilities의 core:window:allow-start-dragging이 있어야 동작한다.
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // 끌기 실패는 치명적이지 않다.
    }
  },

  async control(action: WindowControlAction): Promise<void> {
    try {
      await invoke("window_control", { action });
    } catch {
      // 무시.
    }
  },
};
