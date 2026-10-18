import { describe, expect, it } from "vitest";
import { validRotation, validateModel } from "./modelContract";

function model(overrides = {}) {
  const doc = {
    asset: {
      extras: {
        version: "posed-mesh-v1",
        source_bvh_sha256: "a".repeat(64),
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
    expect(validateModel(model(), "a".repeat(64), "character").scope).toBe("full");
    expect(() => validateModel(model(), "changed", "character")).toThrow();
    expect(() => validateModel(model(), "a".repeat(64), "other")).toThrow();
  });
  it.each([
    { buffers: [{ uri: "https://outside.invalid/mesh" }] },
    { images: [{}] },
    { nodes: [{ mesh: 0, scale: [-1, 1, 1] }] },
    { animations: [{}] },
    { extensionsUsed: ["custom"] },
  ])("rejects resources that can change geometry or fetch externally: %o", (change) => {
    expect(() => validateModel(model(change), "a".repeat(64), "character")).toThrow();
  });
});

it("new body mesh verifies asset hash and exporter revision against embedded metadata", () => {
  const expected = {
    url: "/v1/glb",
    rotation: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    sourceSha: "a".repeat(64),
    characterSha256: "asset",
    modelRevision: "revision",
  };
  const data = model({
    asset: {
      extras: {
        version: "posed-mesh-v1",
        source_bvh_sha256: "a".repeat(64),
        character_id: "character",
        character_sha256: "asset",
        revision: "revision",
        coordinates: "Y-up-hips-origin",
        scope: "full",
      },
    },
  });
  expect(validateModel(data, "a".repeat(64), "character", expected).revision).toBe("revision");
  expect(() =>
    validateModel(data, "a".repeat(64), "character", { ...expected, characterSha256: "wrong" }),
  ).toThrow();
  expect(() =>
    validateModel(data, "a".repeat(64), "character", { ...expected, modelRevision: "wrong" }),
  ).toThrow();
});

it("accepts bounded static UInt16 parts and rejects active resources in every part", () => {
  const parts = [
    { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 },
    { attributes: { POSITION: 3, NORMAL: 4 }, indices: 5 },
  ];
  expect(
    validateModel(model({ meshes: [{ primitives: parts }] }), "a".repeat(64), "character").scope,
  ).toBe("full");
  for (const primitives of [
    [],
    Array.from({ length: 9 }, () => parts[0]),
    [parts[0], { ...parts[1], targets: [] }],
    [parts[0], { ...parts[1], extensions: {} }],
  ]) {
    expect(() =>
      validateModel(model({ meshes: [{ primitives }] }), "a".repeat(64), "character"),
    ).toThrow("unsupported mesh");
  }
});

it("framed parts validate scope and baked camera without permitting a second rotation", () => {
  const rotation = [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ];
  const expected = {
    url: "/v1/model",
    sourceSha: "a".repeat(64),
    rotation,
    scope: "shoulder_head",
    version: "framed-mesh-v1" as const,
    cameraApplied: true,
  };
  const data = model({
    asset: {
      extras: {
        version: "framed-mesh-v1",
        source_bvh_sha256: expected.sourceSha,
        character_id: "character",
        coordinates: "Y-up-hips-origin",
        scope: expected.scope,
        camera_rotation: rotation,
      },
    },
  });
  expect(validateModel(data, expected.sourceSha, "character", expected).scope).toBe(
    "shoulder_head",
  );
  expect(() =>
    validateModel(data, expected.sourceSha, "character", { ...expected, scope: "bust" }),
  ).toThrow();
  expect(() =>
    validateModel(data, expected.sourceSha, "character", {
      ...expected,
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    }),
  ).toThrow();
});
