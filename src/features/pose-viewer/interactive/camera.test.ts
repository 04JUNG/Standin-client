import { expect, it } from "vitest";
import * as THREE from "three";
import { searchCamera, initialObservation } from "./camera";
import type { SearchCamera } from "./contract";
function spec(angle: number, perspective: boolean): SearchCamera {
  const camera = perspective
    ? new THREE.PerspectiveCamera(41, 1.3, 0.1, 50)
    : new THREE.OrthographicCamera(-2.6, 2.6, 2, -2, 0.1, 50);
  camera.position.set(Math.sin(angle) * 4, 0.7, Math.cos(angle) * 4);
  camera.lookAt(0, 0.2, 0);
  camera.updateMatrixWorld(true);
  // Non-centered crop, continuous yaw/pitch, and a projection scale must survive.
  camera.projectionMatrix.elements[8] += 0.13;
  camera.projectionMatrix.elements[9] -= 0.08;
  return {
    schemaVersion: "interactive-camera-v1",
    projection: perspective ? "perspective" : "orthographic",
    viewMatrix: camera.matrixWorldInverse.toArray(),
    projectionMatrix: camera.projectionMatrix.toArray(),
    matrixLayout: "column-major",
    basis: "right-handed-Y-up",
    clipSpace: "webgl-minus-one-to-one",
    origin: "hips",
    units: "meters",
    distanceTorso: 6.3,
    torsoReferenceSha256: "a".repeat(64),
    target: [0, 0.2, 0],
    referenceAspect: 1.3,
    framing: "projection-includes-center-scale-crop",
    baked: "none",
  };
}
it("preserves exact search clip coordinates for eight directions, continuous yaw, both projections and crop", () => {
  for (const perspective of [false, true])
    for (const angle of [...Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4), 0.2713]) {
      const s = spec(angle, perspective),
        actual = searchCamera(s, 1.3, initialObservation());
      const expected = new THREE.Vector4(0.17, 0.61, -0.13, 1)
        .applyMatrix4(new THREE.Matrix4().fromArray(s.viewMatrix))
        .applyMatrix4(new THREE.Matrix4().fromArray(s.projectionMatrix));
      const result = new THREE.Vector4(0.17, 0.61, -0.13, 1)
        .applyMatrix4(actual.matrixWorldInverse)
        .applyMatrix4(actual.projectionMatrix);
      result.toArray().forEach((x, i) => expect(x).toBeCloseTo(expected.toArray()[i], 10));
    }
});
it("does not apply a baked camera twice and never changes export identity during orbit/reset", () => {
  const s = spec(0.34, true),
    before = JSON.stringify(s);
  s.baked = "view";
  const camera = searchCamera(s, 1.3, initialObservation());
  expect(camera.matrixWorldInverse.toArray()).toEqual(new THREE.Matrix4().toArray());
  searchCamera(s, 1.3, { yaw: 1.2, pitch: 0.4, zoom: 1.5, panX: 0.1, panY: 0.2 });
  s.baked = "none";
  expect(JSON.stringify(s)).toBe(before);
  expect(searchCamera(s, 1.3, initialObservation()).projectionMatrix.toArray()).toEqual(
    s.projectionMatrix,
  );
});
it("rejects singular/unknown camera framing instead of using a front view", () => {
  expect(() =>
    searchCamera({ ...spec(0, true), viewMatrix: Array(16).fill(0) }, 1, initialObservation()),
  ).toThrow();
});

function screenX(point: THREE.Vector3, camera: THREE.Camera) {
  const clip = new THREE.Vector4(...point.toArray(), 1)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix);
  return clip.x / clip.w;
}
it("keeps rightward drag and pan screen-relative with ordinary or mirrored search projections", () => {
  for (const perspective of [false, true])
    for (const angle of Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4))
      for (const horizontalSign of [1, -1]) {
        const s = spec(angle, perspective);
        s.projectionMatrix[0] *= horizontalSign;
        const reference = searchCamera(s, 1.3, initialObservation());
        // A surface point on the side facing the camera should follow a rightward drag.
        const point = new THREE.Vector3(...s.target).addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(reference.matrixWorld, 2).normalize(),
          0.2,
        );
        const before = screenX(point, reference);
        const rotated = searchCamera(s, 1.3, { ...initialObservation(), yaw: -0.12 });
        const panned = searchCamera(s, 1.3, { ...initialObservation(), panX: -0.12 });
        expect(
          screenX(point, rotated),
          `orbit: ${perspective}/${angle}/${horizontalSign}`,
        ).toBeGreaterThan(before);
        expect(
          screenX(point, panned),
          `pan: ${perspective}/${angle}/${horizontalSign}`,
        ).toBeGreaterThan(before);
        expect(searchCamera(s, 1.3, initialObservation()).projectionMatrix.toArray()).toEqual(
          s.projectionMatrix,
        );
      }
});

it("keeps pan in screen axes after orbiting around the model", () => {
  for (const perspective of [false, true])
    for (const horizontalSign of [1, -1])
      for (const yaw of [-2.1, 0.8, 2.1]) {
        const s = spec(0.27, perspective);
        s.projectionMatrix[0] *= horizontalSign;
        const observation = { ...initialObservation(), yaw, pitch: 0.45 };
        const reference = searchCamera(s, 1.3, observation);
        const point = new THREE.Vector3(...s.target);
        const panned = searchCamera(s, 1.3, { ...observation, panX: -0.12 });
        expect(screenX(point, panned)).toBeGreaterThan(screenX(point, reference));
      }
});
