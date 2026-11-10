import * as THREE from "three";
import { expect, it } from "vitest";
import { referenceSurfaceCamera } from "./surface";

const surface = {
  body: new THREE.Group(),
  bounds: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1)),
  characterSha: "a".repeat(64),
  release() {},
};

it("uses the same front direction for a missing camera and a verified zero-degree poster", () => {
  const front = referenceSurfaceCamera(surface);
  expect(referenceSurfaceCamera(surface, 0).viewMatrix).toEqual(front.viewMatrix);
  const view = new THREE.Matrix4().fromArray(front.viewMatrix);
  const towardViewer = new THREE.Vector3(0, 1, 1).applyMatrix4(view);
  const awayFromViewer = new THREE.Vector3(0, 1, -1).applyMatrix4(view);
  expect(towardViewer.z).toBeGreaterThan(awayFromViewer.z);
});

it("matches the search rotation and preserves the poster yaw convention", () => {
  const yaw = 45;
  const camera = referenceSurfaceCamera(surface, yaw);
  const reference = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw));
  const view = new THREE.Matrix4().fromArray(camera.viewMatrix);
  const offset = new THREE.Vector3(0.5, 0.25, 0.75);
  expect(
    offset
      .clone()
      .transformDirection(view)
      .distanceTo(offset.clone().transformDirection(reference)),
  ).toBeLessThan(1e-10);

  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, -0.6, 0.2));
  const e = rotation.elements;
  const rows = [
    [e[0], e[4], e[8]],
    [e[1], e[5], e[9]],
    [e[2], e[6], e[10]],
  ];
  const exact = new THREE.Matrix4().fromArray(
    referenceSurfaceCamera(surface, yaw, rows).viewMatrix,
  );
  expect(
    offset
      .clone()
      .transformDirection(exact)
      .distanceTo(offset.clone().transformDirection(rotation)),
  ).toBeLessThan(1e-10);
});
