import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import { boundedBytes } from "../interactive/assets";
import { sameSkin, type Skin } from "./skin";
import { skinPreviewSchema } from "./skinPreview";
const descriptor = z
  .object({ skinPreview: skinPreviewSchema, baseSelectionHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
/** Read-only display assets; this response never grants export permission. */
export async function selectionSkinPreview(
  location: string,
  candidateId: string,
  skin: Skin,
  signal: AbortSignal,
) {
  if (!/^\/v1\/analysis\/jobs\/job_[A-Za-z0-9_-]+\/people\/\d+$/.test(location))
    throw Error("invalid skin location");
  const query = new URLSearchParams({ candidateId, skin: JSON.stringify(skin) });
  const response = await apiFetchResponse(`${location}/selection-skin-preview?${query}`, {
    auth: false,
    signal,
    cache: "no-store",
  });
  const bytes = await boundedBytes(response, 64 * 1024, signal);
  const result = descriptor.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (!sameSkin(result.skinPreview.skin, skin)) throw Error("skin selection changed");
  for (const asset of [result.skinPreview.uv, result.skinPreview.texture]) {
    const url = new URL(asset.url, "https://owned.invalid");
    if (
      url.origin !== "https://owned.invalid" ||
      url.pathname !== `${location}/selection-skin-assets/${asset.sha256}` ||
      url.searchParams.get("candidateId") !== candidateId ||
      url.searchParams.get("skin") !== JSON.stringify(skin) ||
      url.searchParams.get("baseSelectionHash") !== result.baseSelectionHash
    )
      throw Error("skin asset escaped selection");
  }
  return result;
}
