import { webcrypto } from "node:crypto";
import * as THREE from "three";
import { beforeAll, expect, it, vi } from "vitest";
import v1Fixture from "./__fixtures__/converter-packet.json";
import v2Fixture from "./__fixtures__/converter-packet-v2.json";
import bffV1Fixture from "./__fixtures__/bff-converter-packet.json";
import bffV2Fixture from "./__fixtures__/bff-converter-packet-v2.json";
import {
  encodeModel,
  f64,
  joinState,
  sha256,
  splitState,
  stateBytes,
} from "./__fixtures__/binaryState";
import {
  loadBinarySolvedState,
  loadSolvedPacket,
  prepareSurface,
  solvedCamera,
  type PoseModel,
} from "./solved";
import { isBinaryModel, meshTopology } from "./poseModel";
import { ENCODING, toV1Model, triangleIndexJson } from "./shared/interactive_pose_v2.mjs";
beforeAll(() => vi.stubGlobal("crypto", webcrypto));

const expected = {
  operationId: "op_fixture",
  revision: 1,
  stateHash: v2Fixture.packet.stateHash,
  personIndex: 0,
  candidateId: "candidate",
};
const bits = (mesh: THREE.Object3D, name: "position" | "normal") => {
  const array = (mesh as THREE.Mesh).geometry.getAttribute(name).array as Float32Array;
  return [...new Uint32Array(array.buffer, array.byteOffset, array.length)];
};
/** Bitwise (not approximate) equality of every displayed Float32 position and normal. */
function expectSameSurface(
  a: ReturnType<typeof prepareSurface>,
  b: ReturnType<typeof prepareSurface>,
) {
  expect(b.body.children.length).toBe(a.body.children.length);
  a.body.children.forEach((mesh, i) => {
    expect(bits(b.body.children[i], "position")).toEqual(bits(mesh, "position"));
    expect(bits(b.body.children[i], "normal")).toEqual(bits(mesh, "normal"));
  });
}
async function rehashed(bytes: Uint8Array, overrides: Partial<typeof expected> = {}) {
  return { bytes, expectation: { ...expected, ...overrides, stateHash: await sha256(bytes) } };
}

it("re-encodes the v1 converter fixtures losslessly and binds the same selection", async () => {
  for (const [v1, v2, selection] of [
    [v1Fixture, v2Fixture, expected],
    [
      bffV1Fixture,
      bffV2Fixture,
      { ...expected, operationId: bffV2Fixture.packet.operation, revision: 1 },
    ],
  ] as const) {
    const legacy = await loadSolvedPacket(v1.packet, {
      ...selection,
      stateHash: v1.packet.stateHash,
    });
    const binary = await loadBinarySolvedState(stateBytes(v2), {
      ...selection,
      stateHash: v2.packet.stateHash,
    });
    expect(v2.v1StateHash).toBe(v1.packet.stateHash);
    expect(binary.packet).toEqual({
      schema: "solved-pose-state-v1",
      operation: v2.packet.operation,
      revision: v2.packet.revision,
      stateHash: v2.packet.stateHash,
      previewState: "authoritative",
      exportState: "not-requested",
      canonicalEncoding: ENCODING,
      modelSha256: v2.packet.modelSha256,
      stateBytes: v2.packet.stateBytes,
    });
    expect(binary.packet).not.toHaveProperty("canonicalState");
    const { model, ...head } = binary.state;
    const { model: legacyModel, ...legacyHead } = legacy.state;
    expect(head).toEqual(legacyHead);
    expect(isBinaryModel(model)).toBe(true);
    expect(isBinaryModel(legacyModel)).toBe(false);
    expect(toV1Model(model)).toEqual(legacyModel);
    expect(
      solvedCamera(binary.state, {
        target: [0, 0, 0],
        referenceAspect: 1,
        projectionIncludesCenterScaleCrop: true,
      }),
    ).toEqual(
      solvedCamera(legacy.state, {
        target: [0, 0, 0],
        referenceAspect: 1,
        projectionIncludesCenterScaleCrop: true,
      }),
    );
    const a = prepareSurface(legacyModel),
      b = prepareSurface(model);
    expectSameSurface(a, b);
    a.release();
    b.release();
  }
  expect(bffV2Fixture.receipt.stateHash).toBe(bffV2Fixture.packet.stateHash);
  expect(bffV2Fixture.receipt.packetModelSha256).toBe(bffV2Fixture.packet.modelSha256);
});

it("draws the v2 fixture triangle exactly like the v1 assertion", async () => {
  const { state } = await loadBinarySolvedState(stateBytes(v2Fixture), expected);
  const surface = prepareSurface(state.model);
  const mesh = surface.body.children[0] as THREE.Mesh;
  expect([...mesh.geometry.getAttribute("position").array]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  surface.release();
});

/** Deterministic multi-bone, multi-weight, multi-mesh rig: parity must hold beyond one triangle. */
function syntheticModel(seed = 7): PoseModel {
  let s = seed;
  const random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rowMajor = (m: THREE.Matrix4) => m.clone().transpose().toArray();
  const affine = (scale = 1) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(random() * 6.28, random() * 6.28, random() * 6.28),
      ),
      new THREE.Vector3(scale, scale, scale),
    );
  const bones = Array.from({ length: 7 }, (_, i) => {
    const bind = affine(0.9 + random() * 0.2);
    return {
      name: `bone_${i}`,
      parent: i === 0 ? -1 : Math.floor(random() * i),
      restLocal: rowMajor(affine()),
      poseLocal: rowMajor(affine(0.8 + random() * 0.4)),
      inverseBind: rowMajor(bind.invert()),
    };
  });
  const point = (): [number, number, number] => [
    random() * 2 - 1,
    random() * 2 - 1,
    random() * 2 - 1,
  ];
  const mesh = (name: string, vertices: number, normals: number, triangles: number) => ({
    name,
    positions: Array.from({ length: vertices }, point),
    normals: Array.from({ length: normals }, () => {
      const v = new THREE.Vector3(...point()).normalize();
      return [v.x, v.y, v.z] as [number, number, number];
    }),
    triangles: Array.from(
      { length: triangles },
      () => [0, 0, 0].map(() => Math.floor(random() * vertices)) as [number, number, number],
    ),
    normalTriangles: Array.from(
      { length: triangles },
      () => [0, 0, 0].map(() => Math.floor(random() * normals)) as [number, number, number],
    ),
    weights: Array.from({ length: vertices }, () => {
      const ids = [
        ...new Set(
          Array.from({ length: 1 + Math.floor(random() * 4) }, () =>
            Math.floor(random() * bones.length),
          ),
        ),
      ].sort((a, b) => a - b);
      const raw = ids.map(() => 0.05 + random());
      const total = raw.reduce((a, b) => a + b, 0);
      return ids.map((id, i) => [id, raw[i] / total] as [number, number]);
    }),
  });
  return {
    schema: "interactive-pose-model-v1",
    coordinates: {
      space: "right-handed-y-up-metres-hip-origin",
      originBlender: [0.25, -0, 1.5],
      matrixLayout: "row-major",
      baked: "rigged_rest",
    },
    capabilities: { localHands: false },
    bones,
    meshes: [mesh("body", 64, 80, 120), mesh("hair", 23, 23, 31)],
  };
}
async function encodeState(
  model: PoseModel,
  mutateState?: (head: Record<string, unknown>) => void,
) {
  const { stateHeader } = splitState(stateBytes(v2Fixture));
  mutateState?.(stateHeader);
  const { header, body } = encodeModel(model);
  return rehashed(joinState(stateHeader, header, body));
}

it("rebuilds the exact fixture bytes with the independent test encoder", async () => {
  const original = stateBytes(v2Fixture);
  const { stateHeader, modelHeader, body } = splitState(original);
  expect(joinState(stateHeader, modelHeader, body)).toEqual(original);
  const { state } = await loadSolvedPacket(v1Fixture.packet, {
    ...expected,
    stateHash: v1Fixture.packet.stateHash,
  });
  const encoded = encodeModel(state.model);
  expect(joinState(stateHeader, encoded.header, encoded.body)).toEqual(original);
});

it("produces bitwise-identical skinned Float32 geometry for an equivalent multi-bone rig", async () => {
  const model = syntheticModel();
  const { bytes, expectation } = await encodeState(model);
  const { state } = await loadBinarySolvedState(bytes, expectation);
  expect(toV1Model(state.model)).toEqual(model);
  const legacy = prepareSurface(model),
    binary = prepareSurface(state.model);
  expectSameSurface(legacy, binary);
  // Not vacuous: real transforms, two meshes, de-indexed corners.
  expect(binary.body.children.length).toBe(2);
  expect(bits(binary.body.children[0], "position").length).toBe(120 * 3 * 3);
  expect(new Set(bits(binary.body.children[0], "normal")).size).toBeGreaterThan(100);
  legacy.release();
  binary.release();
});

it("keeps the v1 float32 finite check on the v2 path", async () => {
  const model = syntheticModel(11);
  model.meshes[1].positions[0] = [1e300, 0, 0];
  expect(() => prepareSurface(model)).toThrow("surface float32 bounds");
  const { bytes, expectation } = await encodeState(model);
  const { state } = await loadBinarySolvedState(bytes, expectation);
  expect(() => prepareSurface(state.model)).toThrow("surface float32 bounds");
});

it("keeps the 48 MiB surface GPU budget on the v2 path", async () => {
  const { bytes } = await encodeState(syntheticModel(3));
  const { stateHeader, modelHeader, body } = splitState(bytes);
  // One mesh, one vertex, 700k (valid, degenerate) triangles: Σ T × 72 B > 48 MiB.
  const T = 700_000;
  const bones = (modelHeader.bones as unknown[]).length;
  const boneBytes = bones * 48 * 8;
  const parts = [
    body.slice(0, boneBytes),
    new Uint8Array(new Float64Array([0, 0, 0]).buffer),
    new Uint8Array(new Float64Array([0, 0, 1]).buffer),
    new Uint8Array(T * 3 * 4),
    new Uint8Array(T * 3 * 4),
    new Uint8Array(new Uint32Array([0, 1]).buffer),
    new Uint8Array(8), // bone 0 (+ padding)
    new Uint8Array(new Float64Array([1]).buffer),
  ];
  const huge = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (huge.set(p, at), at + p.length), 0);
  const header = {
    ...modelHeader,
    meshes: [{ name: "body", vertices: 1, normals: 1, triangles: T, influences: 1 }],
  };
  const big = await rehashed(joinState(stateHeader, header, huge));
  const { state } = await loadBinarySolvedState(big.bytes, big.expectation);
  expect(() => prepareSurface(state.model)).toThrow("surface GPU budget");
});

it("rejects tampered bytes, wrong expectations and stale selections", async () => {
  const bytes = stateBytes(v2Fixture);
  await expect(
    loadBinarySolvedState(bytes, { ...expected, stateHash: "a".repeat(64) }),
  ).rejects.toThrow("state hash mismatch");
  const flipped = bytes.slice();
  flipped[flipped.length - 1] ^= 1;
  await expect(loadBinarySolvedState(flipped, expected)).rejects.toThrow("state hash mismatch");
  for (const changed of [
    { revision: 2 },
    { operationId: "op_other" },
    { personIndex: 1 },
    { candidateId: "other" },
  ])
    await expect(loadBinarySolvedState(bytes, { ...expected, ...changed })).rejects.toThrow(
      "solved selection mismatch",
    );
  // Re-hashed but non-canonical bytes are still refused by the shared reader.
  const { modelOffset, bodyOffset } = splitState(bytes);
  const headerEnd = 12 + new DataView(bytes.buffer).getUint32(8, true);
  const padding = bytes.slice();
  padding[headerEnd < modelOffset ? headerEnd : bodyOffset - 1] = 1;
  const padded = await rehashed(padding);
  await expect(loadBinarySolvedState(padded.bytes, padded.expectation)).rejects.toThrow();
  const trailing = await rehashed(new Uint8Array([...bytes, 0, 0, 0, 0, 0, 0, 0, 0]));
  await expect(loadBinarySolvedState(trailing.bytes, trailing.expectation)).rejects.toThrow(
    "trailing bytes",
  );
});

it("enforces client-only identity, determinant and id-length checks the shared reader does not", async () => {
  const singular = syntheticModel(5);
  singular.bones[2].inverseBind = Array.from({ length: 16 }, () => 0);
  expect(() => prepareSurface(singular)).toThrow();
  const s = await encodeState(singular);
  await expect(loadBinarySolvedState(s.bytes, s.expectation)).rejects.toThrow(
    "invalid bounded rig/surface",
  );
  const longName = syntheticModel(5);
  longName.bones[1].name = "b".repeat(201);
  const l = await encodeState(longName);
  await expect(loadBinarySolvedState(l.bytes, l.expectation)).rejects.toThrow(
    "invalid bounded rig/surface",
  );
  const badIdentity = await encodeState(syntheticModel(5), (head) => {
    (head.identity as { ownerBinding: string }).ownerBinding = "not-a-digest";
  });
  await expect(loadBinarySolvedState(badIdentity.bytes, badIdentity.expectation)).rejects.toThrow();
  const negativeDistance = await encodeState(syntheticModel(5), (head) => {
    (head.identity as { camera: { distanceTorso: unknown } }).camera.distanceTorso = f64(-1);
  });
  await expect(
    loadBinarySolvedState(negativeDistance.bytes, negativeDistance.expectation),
  ).rejects.toThrow();
});

it("refuses to draw a typed-array model that did not pass the binary loader", async () => {
  const { state } = await loadBinarySolvedState(stateBytes(v2Fixture), expected);
  expect(() => prepareSurface({ ...state.model })).toThrow("unverified binary model");
});

it("exposes the same skin topology and triangle pin bytes for v1 and v2", async () => {
  const legacy = await loadSolvedPacket(v1Fixture.packet, {
    ...expected,
    stateHash: v1Fixture.packet.stateHash,
  });
  const binary = await loadBinarySolvedState(stateBytes(v2Fixture), expected);
  const a = meshTopology(legacy.state.model, 0),
    b = meshTopology(binary.state.model, 0);
  expect(b.triangleJson()).toBe(JSON.stringify(legacy.state.model.meshes[0].triangles));
  expect(b.triangleJson()).toBe(a.triangleJson());
  expect([b.name, b.vertexCount, b.triangleCount]).toEqual([
    a.name,
    a.vertexCount,
    a.triangleCount,
  ]);
  expect([0, 1, 2, 3].map((c) => b.corner(0, c))).toEqual([0, 1, 2, 3].map((c) => a.corner(0, c)));
  expect(b.corner(1, 0)).toBeUndefined();
  const model = syntheticModel();
  const { bytes, expectation } = await encodeState(model);
  const { state } = await loadBinarySolvedState(bytes, expectation);
  for (const i of [0, 1])
    expect(triangleIndexJson(state.model.meshes[i].triangles)).toBe(
      JSON.stringify(model.meshes[i].triangles),
    );
});
