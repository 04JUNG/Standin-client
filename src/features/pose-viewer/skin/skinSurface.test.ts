import { webcrypto } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";
import * as THREE from "three";
import fixture from "../interactive/__fixtures__/converter-packet.json";
import { loadSolvedPacket, prepareSurface } from "../interactive/solved";
import { skinDisplaySurface, skinUvSchema } from "./skinSurface";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
async function sample() {
  const { state } = await loadSolvedPacket(fixture.packet, {
    operationId: "op_fixture",
    revision: 1,
    stateHash: fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  const source = prepareSurface(state.model);
  const uv = skinUvSchema.parse({
    source_sha256: "a".repeat(64),
    triangles: state.model.meshes[0].triangles,
    uv: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  });
  return { state, source, uv, texture: new THREE.Texture() };
}
it("overlays corner UVs without mutating canonical pose, source geometry or shared texture", async () => {
  const { state, source, uv, texture } = await sample();
  const before = JSON.stringify(state.model);
  const original = source.body.children[0] as THREE.Mesh;
  const textureDispose = vi.spyOn(texture, "dispose");
  const overlay = skinDisplaySurface(
    source.body,
    state.model,
    uv,
    uv.source_sha256,
    texture,
    "flesh-guide",
  );
  const displayed = overlay.body.children[0] as THREE.Mesh;
  expect(displayed.geometry).not.toBe(original.geometry);
  expect(original.geometry.getAttribute("uv")).toBeUndefined();
  expect([...displayed.geometry.getAttribute("position").array]).toEqual([
    ...original.geometry.getAttribute("position").array,
  ]);
  expect([...displayed.geometry.getAttribute("normal").array]).toEqual([
    ...original.geometry.getAttribute("normal").array,
  ]);
  expect([...displayed.geometry.getAttribute("uv").array]).toEqual([0, 0, 1, 0, 0, 1]);
  expect(JSON.stringify(state.model)).toBe(before);
  const dispose = vi.spyOn(displayed.geometry, "dispose");
  overlay.release();
  overlay.release();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(textureDispose).not.toHaveBeenCalled();
  source.release();
  texture.dispose();
});
it("refuses wrong model hashes and triangle order instead of approximating UV correspondence", async () => {
  const { state, source, uv, texture } = await sample();
  expect(() =>
    skinDisplaySurface(source.body, state.model, uv, "b".repeat(64), texture, "muscle"),
  ).toThrow();
  const wrong = structuredClone(uv);
  wrong.triangles[0] = [2, 1, 0];
  expect(() =>
    skinDisplaySurface(source.body, state.model, wrong, uv.source_sha256, texture, "muscle"),
  ).toThrow();
  source.release();
  texture.dispose();
});
it("rejects missing UV corners and invalid coordinates before allocating display assets", () => {
  for (const uv of [
    [[0, 0]],
    [
      [0, 0],
      [1, 0],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [NaN, 1],
    ],
  ])
    expect(
      skinUvSchema.safeParse({ source_sha256: "a".repeat(64), triangles: [[0, 1, 2]], uv }).success,
    ).toBe(false);
});
