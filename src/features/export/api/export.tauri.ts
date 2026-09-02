import { invoke } from "@tauri-apps/api/core";
import {
  ExportError,
  type ExportErrorCode,
  type ExportService,
  type SaveCandidateInput,
  type SavedFile,
} from "./export.contract";

/**
 * 바이트 → base64. Rust command가 base64 문자열을 받는다(export.rs 참고).
 *
 * `String.fromCharCode(...bytes)`를 한 번에 쓰지 않는 이유는 스프레드가 인자 개수 상한에
 * 걸려 수 MB FBX에서 RangeError로 죽기 때문이다. 청크로 나눠 이어 붙인다.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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

  async folderExists(path: string): Promise<boolean> {
    try {
      return await invoke<boolean>("folder_exists", { path });
    } catch {
      // 확인에 실패했다고 폴더가 없다고 단정하지 않는다. 저장 시점에 실제 오류로 드러난다.
      return true;
    }
  },

  async saveCandidates(input: { folder: string; files: SaveCandidateInput[] }): Promise<SavedFile[]> {
    // 네이티브 fs 쓰기는 브라우저 다운로드 매니저를 거치지 않으므로 여러 파일을 그대로 각각 저장한다.
    const results: SavedFile[] = [];
    for (const file of input.files) {
      try {
        const saved = await invoke<SavedFile>("save_pose_file", {
          folder: input.folder,
          fileName: file.fileName,
          contentBase64: toBase64(file.content),
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
