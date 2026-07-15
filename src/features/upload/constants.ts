/**
 * 업로드 파일 정책. docs/07 §8, docs/11 §3.
 * 최대 크기·최소 크기는 서버 정책 확정 전 임시값이다(docs/08 §11 Q3, Q4).
 */
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp"] as const;

// 서버 정책과 맞추기 전 임시 상한.
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
// 너무 작은 이미지 거부(임시).
export const MIN_IMAGE_SIZE = 64; // px

// <input type="file"> accept 속성.
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

export const SUPPORTED_LABEL = "PNG · JPG · WEBP";
