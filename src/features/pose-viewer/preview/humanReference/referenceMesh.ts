import * as THREE from "three";
import type { HumanTemplate } from "./template";
import { libraryPreviewMaterial } from "../previewStyle";

export type WristBlend = {
  forearm: number;
  hand: number;
  rest: THREE.Vector3;
  position: THREE.Vector3;
};

/** Bake the fixed template's pose once so the existing viewer can raycast its actual surface. */
export function referenceMesh(
  template: HumanTemplate,
  matrices: THREE.Matrix4[],
  wrists: WristBlend[] = [],
) {
  const body = new THREE.Group();
  const material = libraryPreviewMaterial();
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const positionSum = new THREE.Vector3(),
    normalSum = new THREE.Vector3();
  const normalMatrices = matrices.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  const wristInfluences = new Map<number, { index: number; hand: boolean }>();
  const wristTransforms = wrists.map(({ forearm, hand, rest, position }, index) => {
    wristInfluences.set(forearm, { index, hand: false });
    wristInfluences.set(hand, { index, hand: true });
    return {
      rest,
      position,
      forearm: new THREE.Quaternion().setFromRotationMatrix(matrices[forearm]),
      hand: new THREE.Quaternion().setFromRotationMatrix(matrices[hand]),
    };
  });
  const forearmWeights = new Float64Array(wrists.length);
  const handWeights = new Float64Array(wrists.length);
  const rotation = new THREE.Quaternion();

  for (const mesh of template.meshes) {
    const visible = mesh.triangles.length ? new Set(mesh.triangles) : undefined;
    const positions = new Float32Array(mesh.positions.length);
    const normals = new Float32Array(mesh.normals.length);
    for (let i = 0; i < positions.length / 3; i++) {
      positionSum.set(0, 0, 0);
      normalSum.set(0, 0, 0);
      forearmWeights.fill(0);
      handWeights.fill(0);
      for (let j = i * 8; j < i * 8 + 8; j++) {
        const weight = mesh.skinWeights[j];
        if (!weight) continue;
        const joint = mesh.skinIndices[j];
        const wrist = wristInfluences.get(joint);
        if (wrist) {
          (wrist.hand ? handWeights : forearmWeights)[wrist.index] += weight;
          continue;
        }
        point.fromArray(mesh.positions, i * 3).applyMatrix4(matrices[joint]);
        normal.fromArray(mesh.normals, i * 3).applyMatrix3(normalMatrices[joint]);
        positionSum.addScaledVector(point, weight);
        normalSum.addScaledVector(normal, weight);
      }
      // Both joints map the rest wrist to the same posed wrist. Interpolate
      // their rotation around that point to preserve volume through a twist.
      for (const [index, wrist] of wristTransforms.entries()) {
        const weight = forearmWeights[index] + handWeights[index];
        if (!weight) continue;
        rotation.copy(wrist.forearm).slerp(wrist.hand, handWeights[index] / weight);
        point
          .fromArray(mesh.positions, i * 3)
          .sub(wrist.rest)
          .applyQuaternion(rotation)
          .add(wrist.position);
        normal.fromArray(mesh.normals, i * 3).applyQuaternion(rotation);
        positionSum.addScaledVector(point, weight);
        normalSum.addScaledVector(normal, weight);
      }
      positionSum.toArray(positions, i * 3);
      normalSum.normalize().toArray(normals, i * 3);
      if (!visible || visible.has(i)) bounds.expandByPoint(positionSum);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(mesh.triangles);
    body.add(new THREE.Mesh(geometry, material));
  }
  function release() {
    for (const mesh of body.children) (mesh as THREE.Mesh).geometry.dispose();
    material.dispose();
  }
  if (
    bounds.isEmpty() ||
    bounds.getSize(point).length() > 100 ||
    !Number.isFinite(point.length())
  ) {
    release();
    throw Error("기본 인체 크기가 유효하지 않습니다.");
  }
  return { body, bounds, characterSha: template.character_sha256, release };
}
