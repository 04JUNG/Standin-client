import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadProgress, UpdateAvailability, UpdateService } from "./update.contract";

/**
 * 데스크톱 구현(ADR-011).
 *
 * `check()`가 돌려주는 Update 핸들이 있어야 내려받기가 가능한데 계약에는 그 타입을
 * 노출하지 않는다(프론트가 플러그인 타입에 묶이지 않게). 대신 마지막 확인 결과를
 * 모듈에 들고 있다가 install에서 쓴다 — 확인 없이 설치할 수 있는 경로는 없으므로
 * 이 상태가 UI 흐름과 어긋나지 않는다.
 */
let pending: Update | null = null;

export const updateTauri: UpdateService = {
  currentVersion() {
    return getVersion();
  },

  isConfigured() {
    return invoke<boolean>("updates_configured");
  },

  async check(): Promise<UpdateAvailability> {
    if (!(await invoke<boolean>("updates_configured"))) {
      pending = null;
      return { kind: "disabled" };
    }

    const update = await check();
    pending = update;
    if (!update) return { kind: "up-to-date" };

    return {
      kind: "available",
      version: update.version,
      // 릴리스 노트가 비어 있을 수 있다. 빈 문자열을 그대로 넘기면 UI가 빈 블록을 그린다.
      notes: update.body?.trim() ? update.body.trim() : undefined,
    };
  },

  async install(onProgress?: (progress: DownloadProgress) => void) {
    const update = pending;
    if (!update) {
      throw new Error("설치할 업데이트가 없습니다. 업데이트를 먼저 확인해 주세요.");
    }

    // Content-Length가 없으면 총량을 모른다. 그때는 비율 대신 null을 넘겨
    // UI가 퍼센트를 지어내지 않게 한다.
    let total = 0;
    let received = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          received = 0;
          onProgress?.({ ratio: total > 0 ? 0 : null });
          break;
        case "Progress":
          received += event.data.chunkLength;
          onProgress?.({ ratio: total > 0 ? Math.min(received / total, 1) : null });
          break;
        case "Finished":
          onProgress?.({ ratio: 1 });
          break;
      }
    });
  },

  relaunch() {
    return relaunch();
  },
};
