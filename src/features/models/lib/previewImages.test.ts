import { expect, it } from "vitest";
import { BODY_PREVIEWS, previewFor } from "./previewImages";

it("provides the three retained child/teen stills only for their exact FBX hashes", () => {
  expect(Object.keys(BODY_PREVIEWS)).toHaveLength(3);
  for (const [characterId, asset] of Object.entries(BODY_PREVIEWS)) {
    expect(previewFor(characterId, asset.assetSha256)).toMatch(/\.png/);
    expect(previewFor(characterId, "0".repeat(64))).toBeUndefined();
  }
});

it.each(["body-female-athletic", "body-female-base", "body-female-muscular", "body-male-athletic", "body-male-base", "body-male-muscular"])(
  "removes the retired fixed adult preview %s", (id) => {
    expect(previewFor(id)).toBeUndefined();
    expect(BODY_PREVIEWS[id]).toBeUndefined();
  },
);
