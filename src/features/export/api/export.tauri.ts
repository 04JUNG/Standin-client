import { invoke } from "@tauri-apps/api/core";
import { ExportError, type ExportErrorCode, type ExportService, type SavedFile } from "./export.contract";

const KNOWN_CODES: ExportErrorCode[] = ["CANCELLED", "INVALID_FOLDER", "WRITE_FAILED", "UNSUPPORTED"];

function toExportError(raw: unknown): ExportError {
  // Rust command는 { code, message } 형태로 오류를 반환한다(capture.tauri.ts와 동일 패턴).
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    const code = (raw as { code: string }).code as ExportErrorCode;
    const message = (raw as { message?: string }).message ?? "저장에 실패했습니다.";
    if (KNOWN_CODES.includes(code)) return new ExportError(code, message);
  }
  return new ExportError("UNSUPPORTED", "저장에 실패했습니다.");
}

export const exportTauri: ExportService = {
  async getDefaultFolder(): Promise<string> {
    try {
      return await invoke<string>("default_save_dir");
    } catch (err) {
      throw toExportError(err);
    }
  },

  async chooseFolder(currentFolder?: string): Promise<string | null> {
    try {
      return await invoke<string | null>("choose_save_folder", { current: currentFolder ?? null });
    } catch (err) {
      throw toExportError(err);
    }
  },

  async saveCandidates(input: { folder: string; files: { fileName: string; content: string }[] }): Promise<SavedFile[]> {
    // 네이티브 fs 쓰기는 브라우저 다운로드 매니저를 거치지 않으므로 여러 파일을 그대로 각각 저장한다.
    const results: SavedFile[] = [];
    for (const file of input.files) {
      try {
        const saved = await invoke<SavedFile>("save_pose_file", {
          folder: input.folder,
          fileName: file.fileName,
          content: file.content,
        });
        results.push(saved);
      } catch (err) {
        throw toExportError(err);
      }
    }
    return results;
  },

  async revealInFolder(path: string): Promise<void> {
    try {
      await invoke<void>("reveal_in_folder", { path });
    } catch (err) {
      throw toExportError(err);
    }
  },
};
