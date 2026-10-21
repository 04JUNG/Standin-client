import { expect, it } from "vitest";
import { humanFixture } from "@/test/humanReferenceFixture";
import { basicCloseupScene } from "./basicCloseup";
import * as THREE from "three";
it.each(["head", "shoulder_head"] as const)(
  "renders the already-cropped %s mesh without BVH or deformation",
  (scope) => {
    const mesh = { ...humanFixture(), scope };
    const original = JSON.stringify(mesh);
    const result = basicCloseupScene(mesh);
    const rendered = result.scene.children[0] as THREE.Mesh;
    expect(Array.from(rendered.geometry.getAttribute("position").array)).toEqual(
      Array.from(new Float32Array(mesh.meshes[0].positions)),
    );
    expect(Array.from(rendered.geometry.index!.array)).toEqual(mesh.meshes[0].triangles);
    expect(rendered.geometry.getAttribute("skinWeight")).toBeUndefined();
    expect(result.bounds.isEmpty()).toBe(false);
    expect(result.camera.isOrthographicCamera).toBe(true);
    expect(JSON.stringify(mesh)).toBe(original);
    result.dispose();
  },
);
it("never substitutes a full/half mesh for the close-up", () => {
  expect(() => basicCloseupScene(humanFixture())).toThrow();
  expect(() => basicCloseupScene({ ...humanFixture(), scope: "half" })).toThrow();
});
