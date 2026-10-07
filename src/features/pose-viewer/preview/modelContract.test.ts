import { describe, expect, it } from "vitest";
import { validRotation, validateModel } from "./modelContract";

function model(overrides = {}) {
  const doc = {
    asset: {
      extras: {
        version: "posed-mesh-v1",
        source_bvh_sha256: "source",
        character_id: "character",
        coordinates: "Y-up-hips-origin",
        scope: "full",
      },
    },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{}] }],
    buffers: [{ byteLength: 4 }],
    ...overrides,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(doc));
  const size = Math.ceil(encoded.length / 4) * 4;
  const result = new ArrayBuffer(size + 32),
    view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, size).fill(32);
  new Uint8Array(result, 20, encoded.length).set(encoded);
  return result;
}
describe("static preview contract", () => {
  it("accepts rigid camera rotations but rejects reflections, NaN and shear", () => {
    expect(
      validRotation([
        [0, 0, -1],
        [0, 1, 0],
        [1, 0, 0],
      ]),
    ).toBe(true);
    expect(
      validRotation([
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]),
    ).toBe(false);
    expect(
      validRotation([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, NaN],
      ]),
    ).toBe(false);
    expect(
      validRotation([
        [1, 0, 1],
        [0, 1, 0],
        [0, 0, 1],
      ]),
    ).toBe(false);
  });
  it("checks source and character before loading", () => {
    expect(validateModel(model(), "source", "character").scope).toBe("full");
    expect(() => validateModel(model(), "changed", "character")).toThrow();
    expect(() => validateModel(model(), "source", "other")).toThrow();
  });
  it.each([
    { buffers: [{ uri: "https://outside.invalid/mesh" }] },
    { images: [{}] },
    { nodes: [{ mesh: 0, scale: [-1, 1, 1] }] },
    { animations: [{}] },
    { extensionsUsed: ["custom"] },
  ])("rejects resources that can change geometry or fetch externally: %o", (change) => {
    expect(() => validateModel(model(change), "source", "character")).toThrow();
  });
});
