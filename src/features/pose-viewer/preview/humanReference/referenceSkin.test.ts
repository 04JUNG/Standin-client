import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { renderHook } from "@testing-library/react";
import type { SurfaceView } from "../../interactive/InteractivePose";
import { referenceSkinSurface, useReferenceSkin } from "./referenceSkin";
it("applies corner UVs to the posed preview without replacing source vertex identities or owning the shared texture", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.userData.previewCornerUv = [0, 0, 1, 0, 0, 1];
  const source = new THREE.Group();
  source.add(new THREE.Mesh(geometry));
  const texture = new THREE.Texture();
  const dispose = vi.spyOn(texture, "dispose");
  const result = referenceSkinSurface(source, texture, "flesh-muscle");
  const shown = result.body.children[0] as THREE.Mesh;
  expect(shown.geometry.index).toBeNull();
  expect(Array.from(shown.geometry.getAttribute("uv").array)).toEqual([0, 0, 1, 0, 0, 1]);
  expect(shown.geometry.getAttribute("position").array).toEqual(
    geometry.getAttribute("position").array,
  );
  expect((shown.material as THREE.ShaderMaterial).uniforms.skinFill.value).toBe(0.3);
  result.release();
  expect(dispose).not.toHaveBeenCalled();
  expect(geometry.index?.count).toBe(3);
  expect(geometry.getAttribute("uv")).toBeUndefined();
});

it("keeps the current pose surface visible while a skin texture loads", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const source = { body: new THREE.Group(), camera: {} } as SurfaceView;
  const next = { ...source, body: new THREE.Group() };
  const view = renderHook(({ surface }) => useReferenceSkin(surface, "male", "flesh"), {
    initialProps: { surface: source },
  });
  try {
    expect(view.result.current.surface).toBe(source);
    expect(view.result.current.pending).toBe(true);
    view.rerender({ surface: next });
    expect(view.result.current.surface).toBe(next);
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});
