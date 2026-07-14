import type { UploadDraft, UploadSource } from "@/shared/types/upload";

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function inferMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/**
 * 검증된 File로 UploadDraft를 만든다. previewUrl은 object URL이며
 * draft 폐기 시 반드시 revoke한다(store에서 처리).
 */
export function createUploadDraft(
  file: File,
  dims: { width: number; height: number },
  source: UploadSource = "file",
): UploadDraft {
  return {
    id: crypto.randomUUID(),
    source,
    file,
    previewUrl: URL.createObjectURL(file),
    originalName: file.name,
    mimeType: inferMime(file),
    width: dims.width,
    height: dims.height,
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
  };
}
