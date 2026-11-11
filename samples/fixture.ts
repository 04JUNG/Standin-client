// Procedural UI-only mannequin. No library/personal model or real inference artifact is redistributed.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AnalysisResult, PoseCandidate } from "@/features/pose-viewer/api/pose.contract";
import type { StaticAsset } from "@/features/pose-viewer/interactive/contract";
const sha = (v: number) => String(v).repeat(64);
function shape(rank: number) {
  const parts: THREE.BufferGeometry[] = [];
  const sphere = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const g = new THREE.SphereGeometry(1, 18, 12).toNonIndexed();
    g.scale(sx, sy, sz).translate(x, y, z);
    parts.push(g);
  };
  const limb = (a: number[], b: number[], r: number) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(r * 0.85, r, delta.length(), 12).toNonIndexed();
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      ),
    );
    g.translate(...(start.add(end).multiplyScalar(0.5).toArray() as [number, number, number]));
    parts.push(g);
  };
  sphere(0, 0.4, 0, 0.23, 0.36, 0.14);
  sphere(0, 0.03, 0, 0.2, 0.16, 0.14);
  sphere(0, 0.95, 0, 0.13, 0.18, 0.13);
  limb([0, 0.65, 0], [0, 0.84, 0], 0.08);
  const bend = (rank - 1) * 0.025;
  for (const sign of [-1, 1]) {
    const shoulder = [sign * 0.25, 0.65, 0],
      elbow = [sign * (0.49 + bend), sign < 0 ? 0.32 : 0.85, 0.05],
      wrist = [sign * 0.65, sign < 0 ? 0.07 : 1.1, 0.17 + bend];
    limb(shoulder, elbow, 0.065);
    sphere(...(elbow as [number, number, number]), 0.07, 0.07, 0.07);
    limb(elbow, wrist, 0.05);
    sphere(...(wrist as [number, number, number]), 0.055, 0.08, 0.025);
    const hip = [sign * 0.12, 0, 0],
      knee = [sign * (0.17 + bend), -0.43, 0.03],
      ankle = [sign * (0.22 + bend), -0.83, 0.02];
    limb(hip, knee, 0.1);
    sphere(...(knee as [number, number, number]), 0.085, 0.085, 0.085);
    limb(knee, ankle, 0.065);
    sphere(sign * (0.22 + bend), -0.89, 0.08, 0.065, 0.05, 0.14);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}
function glb(rank: number) {
  const geometry = shape(rank),
    p = geometry.getAttribute("position"),
    n = geometry.getAttribute("normal");
  const pBytes = new Float32Array(p.array).buffer,
    nBytes = new Float32Array(n.array).buffer;
  const bytes = new Uint8Array(pBytes.byteLength + nBytes.byteLength);
  bytes.set(new Uint8Array(pBytes));
  bytes.set(new Uint8Array(nBytes), pBytes.byteLength);
  const doc = {
    asset: {
      version: "2.0",
      extras: {
        version: "posed-mesh-v1",
        source_bvh_sha256: sha(rank),
        character_id: "ui-fixture",
        character_sha256: sha(9),
        coordinates: "Y-up-hips-origin",
        scope: "full",
        revision: "ui-fixture-v1",
      },
    },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    buffers: [{ byteLength: bytes.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pBytes.byteLength, byteLength: nBytes.byteLength, target: 34962 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: p.count,
        type: "VEC3",
        min: [-1, -1, -1],
        max: [1, 2, 1],
      },
      { bufferView: 1, componentType: 5126, count: n.count, type: "VEC3" },
    ],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc)),
    size = Math.ceil(json.length / 4) * 4;
  const result = new ArrayBuffer(12 + 8 + size + 8 + bytes.length),
    view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, size).fill(32);
  new Uint8Array(result, 20, json.length).set(json);
  view.setUint32(20 + size, bytes.length, true);
  view.setUint32(24 + size, 0x004e4942, true);
  new Uint8Array(result, 28 + size).set(bytes);
  geometry.dispose();
  return result;
}
export const models = new Map<string, ArrayBuffer>();
export async function fixtureResult(three: boolean): Promise<AnalysisResult> {
  const candidates: PoseCandidate[] = [];
  for (let rank = 1; rank <= 5; rank++) {
    const data = glb(rank),
      url = `/v1/ui-fixture/models/${rank}`;
    models.set(url, data);
    const view = new THREE.PerspectiveCamera(43, 1, 0.01, 100);
    view.position.set(0.8, 0.6, 3.8);
    view.lookAt(0, 0.15, 0);
    view.updateMatrixWorld(true);
    const asset: StaticAsset = {
      schemaVersion: "interactive-static-asset-v1",
      url,
      sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
      bytes: data.byteLength,
      sourceSha256: sha(rank),
      characterId: "ui-fixture",
      characterSha256: sha(9),
      revision: "ui-fixture-v1",
      scope: "full",
      modelVersion: "posed-mesh-v1",
      camera: {
        schemaVersion: "interactive-camera-v1",
        projection: "perspective",
        viewMatrix: view.matrixWorldInverse.toArray(),
        projectionMatrix: view.projectionMatrix.toArray(),
        matrixLayout: "column-major",
        basis: "right-handed-Y-up",
        clipSpace: "webgl-minus-one-to-one",
        origin: "hips",
        units: "meters",
        distanceTorso: 6,
        torsoReferenceSha256: sha(8),
        target: [0, 0.15, 0],
        referenceAspect: 1,
        framing: "projection-includes-center-scale-crop",
        baked: "none",
      },
    };
    candidates.push({
      id: `fixture-${rank}`,
      poseId: `fixture-${rank}`,
      rank,
      title: `포즈 ${rank}`,
      tags: ["팔 들기", "서 있는 자세"],
      matchLevel: rank < 3 ? "high" : "medium",
      thumbnailUrl: "",
      sourceBvhSha256: sha(rank),
      previewImages: [],
      bvhAvailable: true,
      ...(three ? { interactivePreview: { version: "interactive-preview-v1", asset } } : {}),
    });
  }
  return {
    jobId: "job_ui_fixture",
    source: "image",
    inputPreviewUrl: "/samples/rough.svg",
    people: [
      {
        index: 0,
        box: [0, 0, 360, 480],
        candidates,
        confidence: "high",
        skeletonState: "valid",
        skeletonSource: "full_image",
        coverageClass: "full",
        fallbackMode: "none",
        refineAllowed: false,
        refinableLimbs: [],
      },
    ],
    capabilities: {
      refine: false,
      fbxExport: false,
      characterSelection: false,
      modelPreview: false,
    },
  };
}
