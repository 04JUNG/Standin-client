import * as THREE from "three";
import { z } from "zod";
import type { PoseModel } from "../interactive/solved";
import { libraryPreviewMaterial } from "../preview/previewStyle";
import type { SkinId } from "./skinChoices";
const pair = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
const index = z.number().int().nonnegative().max(500000);
export const skinUvSchema = z
  .object({
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    triangles: z
      .array(z.tuple([index, index, index]))
      .min(1)
      .max(333333),
    uv: z.array(pair).min(3).max(1000000),
  })
  .strict()
  .refine((v) => v.uv.length === v.triangles.length * 3);
export type SkinUv = z.infer<typeof skinUvSchema>;

/** Camera-space lighting matches the existing preview; albedo is an approved sRGB image. */
function skinMaterial(texture: THREE.Texture, skin: SkinId) {
  const material = libraryPreviewMaterial();
  material.side = THREE.DoubleSide;
  material.uniforms.skinMap = { value: texture };
  material.uniforms.skinFill = { value: skin === "flesh" || skin === "flesh-guide" ? 0.3 : 0 };
  material.vertexShader = material.vertexShader
    .replace("varying vec3 previewNormal;", "varying vec3 previewNormal; varying vec2 skinUv;")
    .replace("previewNormal = normalize", "skinUv = uv; previewNormal = normalize");
  material.fragmentShader = material.fragmentShader
    .replace(
      "varying vec3 previewNormal;",
      "varying vec3 previewNormal; varying vec2 skinUv; uniform sampler2D skinMap; uniform float skinFill;",
    )
    .replace(
      "gl_FragColor = vec4(0.72 * (ambient + keyColor * key + fillColor * fill), 1.0);",
      "vec3 light = ambient + keyColor * key + fillColor * fill; vec3 albedo = texture2D(skinMap, skinUv).rgb; gl_FragColor = vec4(albedo * mix(light, vec3(1.0), skinFill), 1.0);",
    );
  return material;
}

/** Own only display geometry/materials. Never mutate canonical points, normals, bones or cached surfaces. */
export function skinDisplaySurface(
  source: THREE.Group,
  model: PoseModel,
  uv: SkinUv,
  characterSha256: string,
  texture: THREE.Texture,
  skin: Exclude<SkinId, "default">,
) {
  const meshes: THREE.Mesh[] = [];
  source.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  if (
    uv.source_sha256 !== characterSha256 ||
    model.meshes.length !== 1 ||
    meshes.length !== 1 ||
    uv.triangles.length !== model.meshes[0].triangles.length ||
    uv.uv.length !== uv.triangles.length * 3 ||
    uv.triangles.some((t, i) => t.some((v, c) => v !== model.meshes[0].triangles[i][c])) ||
    meshes[0].geometry.getAttribute("position").count !== uv.uv.length
  )
    throw Error("skin UV topology changed");
  const body = source.clone(true);
  const owned: THREE.Mesh[] = [];
  body.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone();
    o.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv.uv.flat()), 2));
    o.material = skinMaterial(texture, skin);
    owned.push(o);
  });
  let released = false;
  return {
    body,
    release() {
      if (released) return;
      released = true;
      for (const mesh of owned) {
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          material.dispose();
      }
      // Texture is an approved shared asset and remains owned by its bounded loader.
    },
  };
}
