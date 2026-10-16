import { apiFetchResponse } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import type { Side } from "./contract";

export const handThumbnailKeys = {
  root: (owner: string) => ["hands", owner, "thumbnail"] as const,
  image: (owner: string, library: string, preset: string, side: Side) =>
    [...handThumbnailKeys.root(owner), library, preset, side] as const,
};

/** Load the original, character-relative PNG through the authenticated BFF. */
export async function loadHandThumbnail(
  preset: string,
  side: Side,
  library: string,
  signal: AbortSignal,
): Promise<string> {
  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(preset) ||
    !/^[a-f0-9]{64}$/.test(library) ||
    (side !== "left" && side !== "right")
  )
    throw new Error("손 이미지 요청을 확인하지 못했습니다.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal.reason);
  signal.throwIfAborted();
  signal.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await apiFetchResponse(endpoints.hands.thumbnail(preset, side, library), {
      auth: false,
      signal: controller.signal,
      cache: "no-cache",
    });
    const version = response.headers.get("X-Standin-Hand-Library-SHA256");
    // Older BFFs lack the header; new BFFs also enforce the library query on the proxy.
    if (
      (version !== null && version !== library) ||
      response.headers.get("Content-Type")?.split(";")[0] !== "image/png"
    )
      throw new Error("손 이미지 버전을 확인하지 못했습니다.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 24 ||
      bytes.length > 2 * 1024 * 1024 ||
      !signature.every((byte, i) => bytes[i] === byte)
    )
      throw new Error("손 이미지를 확인하지 못했습니다.");
    signal.throwIfAborted();
    return await blobToDataUrl(new Blob([bytes], { type: "image/png" }));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}
