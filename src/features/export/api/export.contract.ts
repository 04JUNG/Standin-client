/**
 * 저장(export) 계약. docs/12 §3~4, ADR-006.
 *
 * 본문은 문자열이 아니라 바이트다. FBX가 바이너리이기 때문이고, BVH도 같은 경로를 타야
 * 포맷에 따라 저장 코드가 갈리지 않는다.
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

/** 저장할 포즈 파일 하나. `fileName`의 확장자가 곧 포맷이다(.bvh 또는 .fbx). */
export type SaveCandidateInput = { fileName: string; content: Uint8Array };

export interface ExportService {
  /** OS 다운로드 폴더 경로(docs/12 §4 기본값). */
  getDefaultFolder(): Promise<string>;
  /** 네이티브 폴더 선택 대화상자. 취소 시 null. */
  chooseFolder(currentFolder?: string): Promise<string | null>;
  /** 저장 폴더가 아직 존재하는지. 설정에 저장해둔 폴더가 삭제됐을 때 안내하려고 쓴다(docs/03 §9). */
  folderExists(path: string): Promise<boolean>;
  /**
   * 인물별 후보 파일들을 한 번에 저장한다(다인 컷 지원).
   * 브라우저 어댑터는 파일이 여러 개면 zip 하나로 묶어 반환할 수 있다(다중 자동 다운로드는 브라우저가 차단하므로).
   */
  saveCandidates(input: { folder: string; files: SaveCandidateInput[] }): Promise<SavedFile[]>;
  /** 저장된 파일을 OS 파일 탐색기에서 선택된 채로 연다. */
  revealInFolder(path: string): Promise<void>;
}
