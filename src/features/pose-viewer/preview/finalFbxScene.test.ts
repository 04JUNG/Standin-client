import { expect, it } from "vitest";
import * as THREE from "three";
import { finalFbxSurface } from "./finalFbxScene";
it("evaluates the saved skeletal pose before discarding the rig, preserving hand deformation", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const bone = new THREE.Bone(),
    hand = new THREE.Bone();
  bone.add(hand);
  hand.position.y = 1;
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone, hand]));
  hand.position.x = 0.5;
  root.position.set(2, 3, 4);
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const expected = Array.from({ length: 3 }, (_, i) =>
    mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray(),
  );
  const out = finalFbxSurface(root);
  const baked = out.children[0] as THREE.Mesh;
  expect(Array.from(baked.geometry.getAttribute("position").array)).toEqual(expected.flat());
  expect(baked).not.toBeInstanceOf(THREE.SkinnedMesh);
  expect(baked.geometry.getAttribute("skinWeight")).toBeUndefined();
  expect(baked.geometry.getAttribute("normal").count).toBe(3);
});
it("rejects a non-finite surface instead of displaying it", () => {
  const body = new THREE.Group();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([NaN, 0, 0], 3));
  body.add(new THREE.Mesh(g));
  expect(() => finalFbxSurface(body)).toThrow("invalid vertex");
});

it("preserves smooth split normals rather than flattening the saved skin into triangle shading", () => {
  const source = new THREE.Group();
  source.rotation.y = Math.PI / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0, 1, 0, 0], 3));
  source.add(new THREE.Mesh(geometry));
  const result = finalFbxSurface(source);
  const normals = (result.children[0] as THREE.Mesh).geometry.getAttribute("normal");
  expect(normals.getX(0)).toBeCloseTo(1);
  expect(normals.getY(1)).toBeCloseTo(1);
  expect(normals.getZ(2)).toBeCloseTo(-1);
});
