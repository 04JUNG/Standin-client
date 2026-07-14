import { isTauri } from "@tauri-apps/api/core";

/**
 * 오버레이 동안 앱 창을 전체화면으로 전환해 프리즈 프레임이 화면과 1:1로 맞도록 한다.
 * 브라우저에서는 no-op.
 */
export async function setOverlayFullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } catch {
    // 전체화면 전환 실패는 치명적이지 않다. 창 크기 안에서 선택을 계속한다.
  }
}
