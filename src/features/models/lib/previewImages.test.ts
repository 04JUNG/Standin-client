import { expect, it } from "vitest";
import { BODY_PREVIEWS, previewFor } from "./previewImages";

it("provides all nine reviewed body stills only for their exact FBX hashes", () => {
  expect(Object.keys(BODY_PREVIEWS)).toHaveLength(9);
  for (const [characterId, asset] of Object.entries(BODY_PREVIEWS)) {
    expect(previewFor(characterId, asset.assetSha256)).toMatch(/\.png/);
    expect(previewFor(characterId, "0".repeat(64))).toBeUndefined();
  }
});
