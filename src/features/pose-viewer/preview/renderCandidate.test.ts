import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { renderCandidate } from "./renderCandidate";

const calls = vi.hoisted(() => ({ draw: vi.fn(), parse: vi.fn() }));
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    domElement = { toDataURL: () => "rendered-png" };
    getContext = () => ({ isContextLost: () => false });
    setSize() {}
    setPixelRatio() {}
    render = calls.draw;
    dispose() {}
  },
}));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    manager = { setURLModifier() {} };
    parseAsync = calls.parse;
  },
}));
const rotation = [
  [0, 0, -1],
  [0, 1, 0],
  [1, 0, 0],
];
const identity = {
  url: "/v1/model",
  rotation,
  sourceSha: "a".repeat(64),
  characterSha256: "b".repeat(64),
  modelRevision: "c".repeat(64),
};
function model(scope: string, version: string, camera = rotation) {
  const doc = {
    asset: {
      extras: {
        version,
        scope,
        camera_rotation: camera,
        revision: identity.modelRevision,
        character_id: "body",
        character_sha256: identity.characterSha256,
        source_bvh_sha256: identity.sourceSha,
        coordinates: "Y-up-hips-origin",
      },
    },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{}] }],
    buffers: [{ byteLength: 4 }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const size = Math.ceil(json.length / 4) * 4;
  const data = new ArrayBuffer(size + 32),
    view = new DataView(data);
  [0x46546c67, 2, data.byteLength, size, 0x4e4f534a].forEach((n, i) =>
    view.setUint32(i * 4, n, true),
  );
  new Uint8Array(data, 20, size).fill(32);
  new Uint8Array(data, 20, json.length).set(json);
  return data;
}
function surface(full = false) {
  const scene = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, 0, 0, 1, 2, 0, 0, full ? -5 : 1, 0.2], 3),
  );
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  return scene;
}
beforeEach(() => vi.clearAllMocks());

it("fits a scoped surface and does not apply the converter's rotation a second time", async () => {
  const half = surface();
  calls.parse.mockResolvedValueOnce({ scene: half });
  await renderCandidate(
    model("half", "framed-mesh-v1"),
    { ...identity, scope: "half", version: "framed-mesh-v1" },
    "body",
  );
  expect(half.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
  const halfCamera = calls.draw.mock.calls[0]![1] as THREE.OrthographicCamera;
  calls.parse.mockResolvedValueOnce({ scene: surface(true) });
  await renderCandidate(model("full", "posed-mesh-v1"), identity, "body");
  const fullCamera = calls.draw.mock.calls[1]![1] as THREE.OrthographicCamera;
  expect(halfCamera.top).toBeLessThan(fullCamera.top);
  expect(fullCamera.position.y).toBeLessThan(halfCamera.position.y);
});
it("still applies the candidate rotation once to a precomputed full-body model", async () => {
  const body = surface();
  calls.parse.mockResolvedValueOnce({ scene: body });
  await renderCandidate(model("full", "posed-mesh-v1"), identity, "body");
  const expected = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  body.matrixWorld.elements.forEach((value, i) =>
    expect(value).toBeCloseTo(expected.elements[i]!, 12),
  );
});
it("rejects wrong scope, body hash and baked camera before parsing or drawing", async () => {
  const expected = { ...identity, scope: "half", version: "framed-mesh-v1" as const };
  for (const [data, binding] of [
    [model("full", "framed-mesh-v1"), expected],
    [model("half", "framed-mesh-v1"), { ...expected, characterSha256: "d".repeat(64) }],
    [
      model("half", "framed-mesh-v1", [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]),
      expected,
    ],
  ] as const)
    await expect(renderCandidate(data, binding, "body")).rejects.toThrow("lineage");
  expect(calls.parse).not.toHaveBeenCalled();
  expect(calls.draw).not.toHaveBeenCalled();
});
