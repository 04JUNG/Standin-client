import type { BodyScope } from "@/features/pose-viewer/api/outputScope";

// Keep the PNG fallback's paired FBX as the download target too. URLs include
// job, person, candidate, scope and character; the suffix distinguishes refine.
const reviewedFormats = new Map<string, boolean>();
export function rememberFramedFormat(key: string, model: boolean) {
  reviewedFormats.delete(key);
  reviewedFormats.set(key, model);
  if (reviewedFormats.size > 64) reviewedFormats.delete(reviewedFormats.keys().next().value!);
}
export function reviewedModelFormat(key: string, fallback: boolean) {
  return reviewedFormats.get(key) ?? fallback;
}

/** One URL builder for the review image and the FBX download. */
export function framedExportUrl(
  url: string,
  scope: BodyScope,
  format: "preview" | "fbx" | "model",
  characterId: string | null,
  modelPreview = false,
): string {
  const parsed = new URL(url, "https://standin.invalid");
  if (!/^\/v1\/pose-candidates\/[^/]+\/export$/.test(parsed.pathname))
    throw new Error("저장할 포즈 주소를 확인하지 못했습니다. 후보를 다시 선택해 주세요.");
  parsed.pathname = parsed.pathname.replace(/\/export$/, "/framed");
  parsed.searchParams.set("outputScope", scope);
  parsed.searchParams.set("format", format);
  if (modelPreview || format === "model") parsed.searchParams.set("previewType", "model");
  else parsed.searchParams.delete("previewType");
  if (characterId) parsed.searchParams.set("characterId", characterId);
  else parsed.searchParams.delete("characterId");
  return `${parsed.pathname}${parsed.search}`;
}
