import type { PosterCamera } from "../api/posterCamera";
import type { StaticAsset } from "./contract";

const defaultBodies: Record<string, string> = {
  "male-default83-v0-7-6-p1": "085dd9c65a3a66035f7e0ce9e0a9171b9abb0e33dada92194676d92e00c8b026",
  "male-ideal83-v0-7-2": "48883d8a7b60305a6cd87594e25e444fb4254da36987c99f12a74dbd356ef543",
};

export function matchesDefaultPosterView(asset: StaticAsset, poster?: PosterCamera): boolean {
  if (
    !poster ||
    poster.fallback === "legacy_reference" ||
    defaultBodies[asset.characterId] !== asset.characterSha256 ||
    asset.camera.torsoReferenceSha256 !== asset.characterSha256 ||
    asset.camera.projection !== "orthographic"
  )
    return false;

  // The directional poster is level and uses its actual served yaw. Converter's
  // WebGL view is diag(-1, 1, -1) times the search rotation (looking along +Z).
  const yaw = (poster.yaw * Math.PI) / 180;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const expected = [-c, 0, s, 0, 1, 0, -s, 0, -c];
  return expected.every((value, index) => {
    const column = Math.floor(index / 3);
    const row = index % 3;
    return Math.abs(asset.camera.viewMatrix[column * 4 + row] - value) < 1e-5;
  });
}
