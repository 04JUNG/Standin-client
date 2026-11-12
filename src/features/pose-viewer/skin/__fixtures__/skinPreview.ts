import { SKIN_ASSET_PINS } from "../skinAssetPins";
const root = "/v1/analysis/jobs/job_fixture/people/0/interactive-state/op_test";
export function previewFixture() {
  const p = SKIN_ASSET_PINS.find((p) => p.skinId === "flesh")!;
  return {
    schema: "skin-preview-v1",
    skin: { version: "fbx-skin-v1", id: p.skinId },
    assetVersion: p.assetVersion,
    assetManifestSha256: p.manifestSha256,
    compatibility: {
      characterId: p.characterId,
      characterSha256: p.characterSha256,
      previewMesh: p.previewMesh,
      vertices: p.vertices,
      bones: p.bones,
      polygonIndicesSha256: p.polygonIndicesSha256,
      weightsSha256: p.weightsSha256,
      trianglesSha256: p.trianglesSha256,
    },
    uv: { sha256: p.uvSha256, bytes: p.uvBytes, url: `${root}/skin-assets/${p.uvSha256}` },
    texture: {
      sha256: p.previewTextureSha256,
      bytes: p.previewTextureBytes,
      url: `${root}/skin-assets/${p.previewTextureSha256}`,
    },
  };
}
