import * as THREE from "three";
import { beforeAll, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import fixture from "./__fixtures__/converter-packet.json";
import { finalReviewCamera, loadSolvedPacket, solvedCamera } from "./solved";
import { initialObservation, searchCamera } from "./camera";
import { referenceSurfaceCamera } from "../preview/humanReference/surface";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

async function fixtureState() {
  return (
    await loadSolvedPacket(fixture.packet, {
      operationId: "op_fixture",
      revision: 1,
      stateHash: fixture.packet.stateHash,
      personIndex: 0,
      candidateId: "candidate",
    })
  ).state;
}

it("undoes the actual Converter viewing convention, including its back-side camera, without changing source identity", async () => {
  const state = await fixtureState();
  const frame = {
    target: [0.07, 0.2, -0.03] as [number, number, number],
    referenceAspect: 1.3,
    projectionIncludesCenterScaleCrop: true as const,
  };
  for (const perspective of [false, true])
    for (const mirroredPose of [false, true])
      for (const yaw of [0, 0.7, -1.4, Math.PI]) {
        const reference = perspective
          ? new THREE.PerspectiveCamera(43, frame.referenceAspect, 0.1, 50)
          : new THREE.OrthographicCamera(-2.6, 2.6, 2, -2, 0.1, 50);
        reference.position.set(
          frame.target[0] + Math.sin(yaw) * 4,
          0.7,
          frame.target[2] + Math.cos(yaw) * 4,
        );
        reference.lookAt(...frame.target);
        reference.updateMatrixWorld(true);
        reference.projectionMatrix.elements[perspective ? 8 : 12] += 0.13;
        reference.projectionMatrix.elements[perspective ? 9 : 13] -= 0.08;
        reference.projectionMatrixInverse.copy(reference.projectionMatrix).invert();
        // Match converter/interactive_camera.py: D @ R and a negative P00,
        // keeping the same negative viewing distance from the calibrated target.
        const searchView = reference.matrixWorldInverse.clone();
        const depth = new THREE.Vector3(...frame.target).applyMatrix4(searchView).z;
        searchView.premultiply(new THREE.Matrix4().makeScale(-1, 1, -1));
        searchView.elements[14] += 2 * depth;
        const reflected = reference.projectionMatrix.clone();
        reflected.elements[0] *= -1;
        const input = {
          identity: {
            ...state.identity,
            mirror: mirroredPose,
            camera: {
              ...state.identity.camera,
              projection: perspective ? ("perspective" as const) : ("orthographic" as const),
              viewMatrix: searchView.clone().transpose().toArray(),
              projectionMatrix: reflected.transpose().toArray(),
            },
          },
        };
        const before = JSON.stringify(input);
        const raw = solvedCamera(input, frame),
          fixed = finalReviewCamera(input, frame);
        const physical = {
          ...raw,
          viewMatrix: reference.matrixWorldInverse.toArray(),
          projectionMatrix: reference.projectionMatrix.toArray(),
        };
        for (const observation of [
          initialObservation(),
          { ...initialObservation(), yaw: -0.4, pitch: 0.2, zoom: 1.6 },
          { ...initialObservation(), yaw: 0.8, pitch: -0.3, zoom: 0.7 },
          initialObservation(),
        ]) {
          const actual = searchCamera(fixed, 1.8, observation),
            expected = searchCamera(physical, 1.8, observation);
          actual.matrixWorld.elements.forEach((v, i) =>
            expect(v).toBeCloseTo(expected.matrixWorld.elements[i], 10),
          );
          expect(actual.projectionMatrix.toArray()).toEqual(expected.projectionMatrix.toArray());
          // Asymmetric points exercise depth and screen handedness, not just a symmetric T pose.
          for (const point of [
            new THREE.Vector3(-0.8, 0.6, 0.4),
            new THREE.Vector3(0.3, -0.4, -0.2),
          ]) {
            const p = point.clone().project(actual).toArray();
            point
              .clone()
              .project(expected)
              .toArray()
              .forEach((v, i) => expect(p[i]).toBeCloseTo(v, 10));
          }
        }
        expect(JSON.stringify(input)).toBe(before);
        expect(solvedCamera(input, frame)).toEqual(raw);
        expect(new THREE.Matrix4().fromArray(fixed.viewMatrix).determinant()).toBeCloseTo(1, 10);
      }
});

it("starts the zero search view at the same +Z front as Top5, without replacing intentionally rear or tilted rough views", async () => {
  const state = await fixtureState();
  const frame = {
    target: [0, 0, 0] as [number, number, number],
    referenceAspect: 1,
    projectionIncludesCenterScaleCrop: true as const,
  };
  const surface = {
    body: new THREE.Group(),
    bounds: new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    characterSha: "a".repeat(64),
    release() {},
  };
  for (const [yaw, pitch, roll] of [
    [0, 0, 0],
    [0.6, 0.3, -0.2],
    [Math.PI, 0, 0],
  ]) {
    const rotation = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(pitch, yaw, roll, "YXZ"),
    );
    const e = rotation.elements,
      rows = [
        [e[0], e[4], e[8]],
        [e[1], e[5], e[9]],
        [e[2], e[6], e[10]],
      ];
    const searchView = new THREE.Matrix4().makeScale(-1, 1, -1).multiply(rotation);
    searchView.elements[14] = -5;
    const input = {
      identity: {
        ...state.identity,
        camera: {
          ...state.identity.camera,
          viewMatrix: searchView.clone().transpose().toArray(),
          projectionMatrix: [-1, 0, 0, 0, 0, 1, 0, -0.1, 0, 0, -0.04, -1, 0, 0, 0, 1],
        },
      },
    };
    const camera = searchCamera(finalReviewCamera(input, frame), 1, initialObservation());
    const top5 = new THREE.Matrix4().fromArray(referenceSurfaceCamera(surface, 0, rows).viewMatrix);
    const direction = new THREE.Vector3(0.2, 0.3, 1);
    expect(
      direction
        .clone()
        .transformDirection(camera.matrixWorldInverse)
        .distanceTo(direction.clone().transformDirection(top5)),
    ).toBeLessThan(1e-10);
    if (yaw === 0)
      expect(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).z).toBeGreaterThan(0);
    if (yaw === Math.PI)
      expect(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).z).toBeLessThan(0);
  }
});

it("leaves an already unreflected camera and its crop unchanged", async () => {
  const state = await fixtureState();
  const frame = {
    target: [0, 0, 0] as [number, number, number],
    referenceAspect: 1,
    projectionIncludesCenterScaleCrop: true as const,
  };
  expect(finalReviewCamera(state, frame)).toEqual(solvedCamera(state, frame));
});
