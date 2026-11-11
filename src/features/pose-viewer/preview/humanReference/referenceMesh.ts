import * as THREE from "three";
import type { HumanTemplate } from "./template";
import { libraryPreviewMaterial } from "../previewStyle";

/** Bake the fixed template's pose once so the existing viewer can raycast its actual surface. */
export function referenceMesh(template: HumanTemplate, matrices: THREE.Matrix4[]) {
  const body = new THREE.Group();
  const material = libraryPreviewMaterial();
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const positionSum = new THREE.Vector3(),
    normalSum = new THREE.Vector3();
  const normalMatrices = matrices.map((m) => new THREE.Matrix3().getNormalMatrix(m));

  for (const mesh of template.meshes) {
    const positions = new Float32Array(mesh.positions.length);
    const normals = new Float32Array(mesh.normals.length);
    for (let i = 0; i < positions.length / 3; i++) {
      positionSum.set(0, 0, 0);
      normalSum.set(0, 0, 0);
      for (let j = i * 8; j < i * 8 + 8; j++) {
        const weight = mesh.skinWeights[j];
        if (!weight) continue;
        const joint = mesh.skinIndices[j];
        point.fromArray(mesh.positions, i * 3).applyMatrix4(matrices[joint]);
        normal.fromArray(mesh.normals, i * 3).applyMatrix3(normalMatrices[joint]);
        positionSum.addScaledVector(point, weight);
        normalSum.addScaledVector(normal, weight);
      }
      positionSum.toArray(positions, i * 3);
      normalSum.normalize().toArray(normals, i * 3);
      bounds.expandByPoint(positionSum);
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
