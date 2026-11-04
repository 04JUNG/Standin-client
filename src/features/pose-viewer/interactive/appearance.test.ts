import { expect, it } from "vitest";
import * as THREE from "three";
import { appearanceMaterial } from "./appearance";
import { libraryPreviewMaterial } from "../preview/previewStyle";
it("isolates each view tint and leaves the pinned offline-poster material unchanged", () => {
  const source = libraryPreviewMaterial(),
    shader = source.fragmentShader;
  const a = appearanceMaterial(source) as THREE.ShaderMaterial,
    b = appearanceMaterial(source) as THREE.ShaderMaterial;
  a.uniforms.baseColor.value.set(1, 0.8, 0.6);
  expect(b.uniforms.baseColor.value.toArray()).toEqual([0.72, 0.72, 0.72]);
  expect(source.uniforms.baseColor).toBeUndefined();
  expect(source.fragmentShader).toBe(shader);
  expect(
    b.fragmentShader
      .replace("uniform vec3 baseColor, ambient,", "uniform vec3 ambient,")
      .replace("baseColor * (ambient", "0.72 * (ambient"),
  ).toBe(shader);
  a.dispose();
  b.dispose();
  source.dispose();
});
