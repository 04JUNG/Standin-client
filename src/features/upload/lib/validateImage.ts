import type { AppError } from "@/shared/api/errors";
import { ALLOWED_EXT, ALLOWED_MIME, MAX_FILE_BYTES, MIN_IMAGE_SIZE } from "../constants";

export type ImageValidation =
  { ok: true; width: number; height: number } | { ok: false; error: AppError };

function fail(message: string): ImageValidation {
  return { ok: false, error: { kind: "validation", message } };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * 이미지 파일 검증. MIME과 확장자를 모두 확인하고(docs/11 §3),
 * 디코딩으로 손상 여부와 실제 크기를 얻는다(docs/03 §5 검증 오류).
 * 원본 파일은 수정하지 않는다.
 */
export async function validateImageFile(file: File): Promise<ImageValidation> {
  const ext = extensionOf(file.name);
  const extOk = (ALLOWED_EXT as readonly string[]).includes(ext);
  // 브라우저가 type을 비워 줄 수 있으므로, type이 있으면 허용 목록과 일치해야 한다.
  const mimeOk = file.type === "" || (ALLOWED_MIME as readonly string[]).includes(file.type);
  if (!extOk || !mimeOk) {
    return fail("지원하지 않는 파일 형식입니다. PNG, JPG, WEBP를 사용해 주세요.");
  }

  if (file.size > MAX_FILE_BYTES) {
    return fail("파일이 너무 큽니다. 더 작은 이미지를 사용해 주세요.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return fail("이미지를 열 수 없습니다. 파일이 손상되었을 수 있습니다.");
  }

  const { width, height } = bitmap;
  bitmap.close();

  if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) {
    return fail("이미지가 너무 작습니다.");
  }

  return { ok: true, width, height };
}
