import type { BodyScope } from "@/features/pose-viewer/api/outputScope";

/** One URL builder for the review image and the FBX download. */
export function framedExportUrl(
  url: string,
  scope: BodyScope,
  format: "preview" | "fbx",
  characterId: string | null,
): string {
  const parsed = new URL(url, "https://standin.invalid");
  if (!/^\/v1\/pose-candidates\/[^/]+\/export$/.test(parsed.pathname))
    throw new Error("저장할 포즈 주소를 확인하지 못했습니다. 후보를 다시 선택해 주세요.");
  parsed.pathname = parsed.pathname.replace(/\/export$/, "/framed");
  parsed.searchParams.set("outputScope", scope);
  parsed.searchParams.set("format", format);
  if (characterId) parsed.searchParams.set("characterId", characterId);
  else parsed.searchParams.delete("characterId");
  return `${parsed.pathname}${parsed.search}`;
}
