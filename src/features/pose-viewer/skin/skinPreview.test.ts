import { expect, it } from "vitest";
import { SKIN_ASSET_PINS } from "./skinAssetPins";
import { skinPreviewSchema, checkSkinPreviewPaths } from "./skinPreview";
import { previewFixture } from "./__fixtures__/skinPreview";
const root = "/v1/analysis/jobs/job_fixture/people/0/interactive-state/op_test";
it("accepts exact current preview derivatives while rejecting old topology and final-image substitution", () => {
  const v = previewFixture();
  expect(skinPreviewSchema.safeParse(v).success).toBe(true);
  for (const change of [
    { ...v, compatibility: { ...v.compatibility, vertices: 24994 } },
    { ...v, compatibility: { ...v.compatibility, trianglesSha256: "a".repeat(64) } },
    { ...v, texture: { ...v.texture, sha256: SKIN_ASSET_PINS[0].textureSha256 } },
    { ...v, uv: { ...v.uv, url: "https://external.invalid/image" } },
    { ...v, assetManifestSha256: "a".repeat(64) },
  ])
    expect(skinPreviewSchema.safeParse(change).success).toBe(false);
});
it("binds both asset URLs to this operation even for valid immutable hashes", () => {
  const v = skinPreviewSchema.parse(previewFixture());
  expect(() => checkSkinPreviewPaths(v, root)).not.toThrow();
  expect(() => checkSkinPreviewPaths(v, root.replace("op_test", "op_other"))).toThrow();
  expect(() =>
    checkSkinPreviewPaths({ ...v, texture: { ...v.texture, url: v.uv.url } }, root),
  ).toThrow();
});

it("pins current anatomy bone counts instead of accepting the previous 52-bone identity", () => {
  const value = previewFixture();
  expect(value.compatibility.bones).toBe(54);
  expect(skinPreviewSchema.safeParse(value).success).toBe(true);
  value.compatibility.bones = 52;
  expect(skinPreviewSchema.safeParse(value).success).toBe(false);
});
