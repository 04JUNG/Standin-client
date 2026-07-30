import { invoke } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { DragService } from "./drag.contract";

/**
 * 네이티브 드래그 어댑터(ADR-009).
 *
 * 플러그인이 미리보기 이미지 경로를 요구하므로 Rust에서 한 번 만들어 둔 경로를 받아 캐시한다.
 */
let cachedIconPath: string | null = null;

async function dragIconPath(): Promise<string> {
  if (!cachedIconPath) {
    cachedIconPath = await invoke<string>("drag_icon_path");
  }
  return cachedIconPath;
}

export const dragTauri: DragService = {
  isSupported: true,

  async startFileDrag(paths, onEnd) {
    if (paths.length === 0) return;
    const icon = await dragIconPath();

    // mode: "copy" — 드롭 대상이 파일을 가져가도 원본은 저장 폴더에 남아야 한다.
    await startDrag({ item: paths, icon, mode: "copy" }, (payload) => {
      onEnd?.(payload.result === "Dropped" ? "dropped" : "cancelled");
    });
  },
};
