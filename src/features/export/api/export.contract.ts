/**
 * 저장(export) 계약. docs/12 §3~4, ADR-006.
 * 실제 서버 signed URL 다운로드는 아직 없음 — content는 프론트에서 만든 placeholder(§6).
 */
export type ExportErrorCode = "CANCELLED" | "INVALID_FOLDER" | "WRITE_FAILED" | "UNSUPPORTED";

export class ExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export type SavedFile = { path: string };

export type SaveCandidateInput = { fileName: string; content: string };

export interface ExportService {
  /** OS 다운로드 폴더 경로(docs/12 §4 기본값). */
  getDefaultFolder(): Promise<string>;
  /** 네이티브 폴더 선택 대화상자. 취소 시 null. */
  chooseFolder(currentFolder?: string): Promise<string | null>;
  /**
   * 인물별 후보 파일들을 한 번에 저장한다(다인 컷 지원).
   * 브라우저 어댑터는 파일이 여러 개면 zip 하나로 묶어 반환할 수 있다(다중 자동 다운로드는 브라우저가 차단하므로).
   */
  saveCandidates(input: { folder: string; files: SaveCandidateInput[] }): Promise<SavedFile[]>;
  /** 저장된 파일을 OS 파일 탐색기에서 선택된 채로 연다. */
  revealInFolder(path: string): Promise<void>;
}
