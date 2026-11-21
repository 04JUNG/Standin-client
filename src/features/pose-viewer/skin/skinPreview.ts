import * as THREE from "three";
import { z } from "zod";
import { apiFetchResponse } from "@/shared/api/client";
import { boundedBytes, verifyBytes, BoundedQueue } from "../interactive/assets";
import { pollWithRecovery } from "../interactive/pollRecovery";
import { digest, ownedPath } from "../interactive/contract";
import { meshTopology, type AnyPoseModel } from "../interactive/poseModel";
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
      .max(16 * 1024 * 1024),
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
        bones: z.number().int().positive().max(256),
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
// Read-only selection descriptors authorize these immutable public model assets.
// Cache verified bytes only; operation-bound legacy reads keep their original fences.
const verifiedSelectionAssets = new Map<string, ArrayBuffer>();
let verifiedAssetBytes = 0;
export function checkSkinPreviewPaths(preview: SkinPreview, root: string) {
  for (const a of [preview.uv, preview.texture])
    if (a.url !== `${root}/skin-assets/${a.sha256}`) throw Error("skin asset escaped operation");
}
/** Exact prebuilt asset bytes; no source URLs, per-pose painting or canonical model changes. */
export async function loadSkinSurface(
  preview: SkinPreview,
  expected: { stateHash: string; revision: number } | { baseSelectionHash: string },
  source: THREE.Group,
  model: AnyPoseModel,
  signal: AbortSignal,
) {
  const c = preview.compatibility;
  if (model.meshes.length !== 1) throw Error("skin model changed");
  const mesh = meshTopology(model, 0);
  if (
    mesh.name !== c.previewMesh ||
    mesh.vertexCount !== c.vertices ||
    model.bones.length !== c.bones
  )
    throw Error("skin model changed");
  // v1: JSON.stringify of nested triangles; v2: the byte-identical triangleIndexJson.
  const triangleBytes = new TextEncoder().encode(mesh.triangleJson());
  await verifyBytes(triangleBytes.buffer, c.trianglesSha256);
  signal.throwIfAborted();
  const assetsAbort = new AbortController();
  const cancelAssets = () => assetsAbort.abort(signal.reason);
  signal.addEventListener("abort", cancelAssets, { once: true });
  const assetSignal = assetsAbort.signal;
  async function fetchAsset(a: SkinPreview["uv"], contentType: string) {
    const cached = "baseSelectionHash" in expected && verifiedSelectionAssets.get(a.sha256);
    if (cached) {
      assetSignal.throwIfAborted();
      return cached;
    }
    return pollWithRecovery((attempt) => downloads.run(async () => {
      const response = await apiFetchResponse(a.url, { auth: false, signal: attempt, cache: "no-store" });
      if (
        response.headers.get("Content-Type")?.split(";")[0] !== contentType ||
        response.headers.get("X-Skin-Asset-SHA256") !== a.sha256 ||
        ("baseSelectionHash" in expected
          ? response.headers.get("X-Standin-Base-Selection-Hash") !== expected.baseSelectionHash
          : response.headers.get("X-Standin-State-Hash") !== expected.stateHash ||
            response.headers.get("X-Standin-Revision") !== String(expected.revision))
      ) {
        await response.body?.cancel().catch(() => {});
        throw Error("skin asset binding changed");
      }
      const bytes = await boundedBytes(response, a.bytes, attempt);
      if (bytes.byteLength !== a.bytes) throw Error("skin asset length changed");
      await verifyBytes(bytes, a.sha256);
      attempt.throwIfAborted();
      if ("baseSelectionHash" in expected && !verifiedSelectionAssets.has(a.sha256)) {
        while (
          verifiedAssetBytes + bytes.byteLength > 64 * 1024 * 1024 ||
          verifiedSelectionAssets.size >= 16
        ) {
          const oldest = verifiedSelectionAssets.keys().next().value;
          if (!oldest) break;
          verifiedAssetBytes -= verifiedSelectionAssets.get(oldest)!.byteLength;
          verifiedSelectionAssets.delete(oldest);
        }
        verifiedSelectionAssets.set(a.sha256, bytes);
        verifiedAssetBytes += bytes.byteLength;
      }
      return bytes;
    }, attempt), assetSignal, Date.now() + 30_000);
  }
  const [compressed, image] = await Promise.all([
    fetchAsset(preview.uv, "application/gzip"),
    fetchAsset(preview.texture, "image/png"),
  ]).finally(() => {
    signal.removeEventListener("abort", cancelAssets);
    assetsAbort.abort();
  });
  const unpacked = await boundedBytes(
    new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))),
    64 * 1024 * 1024,
    signal,
  );
  const uv = skinUvSchema.parse(JSON.parse(new TextDecoder().decode(unpacked)));
  if (
    uv.source_sha256 !== c.characterSha256 ||
    uv.triangles.length !== mesh.triangleCount ||
    uv.triangles.some((t, i) => t.some((v, j) => v !== mesh.corner(i, j)))
  )
    throw Error("skin UV correspondence changed");
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
