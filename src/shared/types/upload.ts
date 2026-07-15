/**
 * 입력 초안 모델. docs/07_CAPTURE_AND_UPLOAD_SPEC.md §9 / docs/09 §2와 동일 정본.
 * source에 따라 localPath(capture/파일선택 dialog) 또는 file(drag&drop/클립보드)이 채워진다.
 */
export type UploadSource = "file" | "capture" | "clipboard";

export type UploadDraft = {
  id: string;
  source: UploadSource;
  localPath?: string;
  file?: File;
  previewUrl: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes?: number;
  createdAt: string;
};
