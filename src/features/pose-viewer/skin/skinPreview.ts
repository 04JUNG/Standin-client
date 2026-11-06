import * as THREE from "three";
import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import { boundedBytes, verifyBytes, BoundedQueue } from "../interactive/assets";
import { digest, ownedPath } from "../interactive/contract";
import type { PoseModel } from "../interactive/solved";
import { skinSchema, sameSkin } from "./skin";
import { SKIN_ASSET_PINS } from "./skinAssetPins";
import { skinDisplaySurface, skinUvSchema } from "./skinSurface";
const asset = z
  .object({
    sha256: digest,
    bytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
    url: ownedPath,
  })
  .strict();
export const skinPreviewSchema = z
  .object({
    schema: z.literal("skin-preview-v1"),
    skin: skinSchema.refine((s) => s.id !== "default"),
    assetVersion: z.string().min(1).max(100),
    assetManifestSha256: digest,
    compatibility: z
      .object({
        characterId: z.string().min(1).max(200),
        characterSha256: digest,
        previewMesh: z.string().min(1).max(200),
        vertices: z.number().int().positive().max(500000),
        bones: z.literal(52),
        polygonIndicesSha256: digest,
        weightsSha256: digest,
        trianglesSha256: digest,
      })
      .strict(),
    uv: asset,
    texture: asset,
  })
  .strict()
  .superRefine((v, ctx) => {
    const c = v.compatibility;
    if (
      !SKIN_ASSET_PINS.some(
        (p) =>
          p.manifestSha256 === v.assetManifestSha256 &&
          p.assetVersion === v.assetVersion &&
          p.skinId === v.skin.id &&
          p.characterId === c.characterId &&
          p.characterSha256 === c.characterSha256 &&
          p.vertices === c.vertices &&
          p.bones === c.bones &&
          p.previewMesh === c.previewMesh &&
          p.polygonIndicesSha256 === c.polygonIndicesSha256 &&
          p.weightsSha256 === c.weightsSha256 &&
          p.trianglesSha256 === c.trianglesSha256 &&
          p.uvSha256 === v.uv.sha256 &&
          p.uvBytes === v.uv.bytes &&
          p.previewTextureSha256 === v.texture.sha256 &&
          p.previewTextureBytes === v.texture.bytes,
      )
    )
      ctx.addIssue({ code: "custom", message: "unsupported skin preview assets" });
  });
export type SkinPreview = z.infer<typeof skinPreviewSchema>;
const downloads = new BoundedQueue(2);
export function checkSkinPreviewPaths(preview: SkinPreview, root: string) {
  for (const a of [preview.uv, preview.texture])
    if (a.url !== `${root}/skin-assets/${a.sha256}`) throw Error("skin asset escaped operation");
}
/** Exact prebuilt asset bytes; no source URLs, per-pose painting or canonical model changes. */
export async function loadSkinSurface(
  preview: SkinPreview,
  expected: { stateHash: string; revision: number },
  source: THREE.Group,
  model: PoseModel,
  signal: AbortSignal,
) {
  const c = preview.compatibility,
    mesh = model.meshes[0];
  if (
    model.meshes.length !== 1 ||
    mesh.name !== c.previewMesh ||
    mesh.positions.length !== c.vertices ||
    model.bones.length !== c.bones
  )
    throw Error("skin model changed");
  const triangleBytes = new TextEncoder().encode(JSON.stringify(mesh.triangles));
  await verifyBytes(triangleBytes.buffer, c.trianglesSha256);
  async function fetchAsset(a: SkinPreview["uv"], contentType: string) {
    return downloads.run(async () => {
      const response = await apiFetchResponse(a.url, { auth: false, signal, cache: "no-store" });
      if (
        response.headers.get("Content-Type")?.split(";")[0] !== contentType ||
        response.headers.get("X-Skin-Asset-SHA256") !== a.sha256 ||
        response.headers.get("X-Standin-State-Hash") !== expected.stateHash ||
        response.headers.get("X-Standin-Revision") !== String(expected.revision)
      )
        throw Error("skin asset binding changed");
      const bytes = await boundedBytes(response, a.bytes, signal);
      if (bytes.byteLength !== a.bytes) throw Error("skin asset length changed");
      await verifyBytes(bytes, a.sha256);
      signal.throwIfAborted();
      return bytes;
    }, signal);
  }
  const compressed = await fetchAsset(preview.uv, "application/gzip");
  const unpacked = await boundedBytes(
    new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))),
    16 * 1024 * 1024,
    signal,
  );
  const uv = skinUvSchema.parse(JSON.parse(new TextDecoder().decode(unpacked)));
  if (
    uv.source_sha256 !== c.characterSha256 ||
    uv.triangles.length !== mesh.triangles.length ||
    uv.triangles.some((t, i) => t.some((v, j) => v !== mesh.triangles[i][j]))
  )
    throw Error("skin UV correspondence changed");
  const image = await fetchAsset(preview.texture, "image/png");
  const bytes = new Uint8Array(image),
    header = new DataView(image);
  if (
    bytes.length < 33 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v) ||
    new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR" ||
    header.getUint32(16) !== 2048 ||
    header.getUint32(20) !== 2048
  )
    throw Error("skin image dimensions changed");
  const bitmap = await createImageBitmap(new Blob([image], { type: "image/png" }), {
    imageOrientation: "flipY",
    colorSpaceConversion: "none",
  });
  let texture: THREE.Texture | undefined;
  try {
    signal.throwIfAborted();
    if (bitmap.width !== 2048 || bitmap.height !== 2048) throw Error("skin image budget");
    texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    const display = skinDisplaySurface(
      source,
      model,
      uv,
      c.characterSha256,
      texture,
      preview.skin.id as Exclude<typeof preview.skin.id, "default">,
    );
    let released = false;
    return {
      body: display.body,
      release() {
        if (released) return;
        released = true;
        display.release();
        texture!.dispose();
        bitmap.close();
      },
    };
  } catch (error) {
    texture?.dispose();
    bitmap.close();
    throw error;
  }
}
export { sameSkin };
