import * as THREE from "three";
import { beforeAll, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import fixture from "./__fixtures__/converter-packet.json";
import { finalReviewCamera, loadSolvedPacket, solvedCamera } from "./solved";
import { initialObservation, searchCamera } from "./camera";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

it("shows the exported body's handedness with reflected search projections, without changing its identity", async () => {
  const { state } = await loadSolvedPacket(fixture.packet, {
    operationId: "op_fixture",
    revision: 1,
    stateHash: fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  const frame = {
    target: [0, 0.2, 0] as [number, number, number],
    referenceAspect: 1.3,
    projectionIncludesCenterScaleCrop: true as const,
  };
  for (const perspective of [false, true])
    for (const mirroredPose of [false, true])
      for (const yaw of [0, 0.7, -1.4]) {
        const reference = perspective
          ? new THREE.PerspectiveCamera(43, frame.referenceAspect, 0.1, 50)
          : new THREE.OrthographicCamera(-2.6, 2.6, 2, -2, 0.1, 50);
        reference.position.set(Math.sin(yaw) * 4, 0.7, Math.cos(yaw) * 4);
        reference.lookAt(...frame.target);
        reference.updateMatrixWorld(true);
        // Off-axis framing belongs to the camera, independently of screen handedness.
        reference.projectionMatrix.elements[perspective ? 8 : 12] += 0.13;
        reference.projectionMatrix.elements[perspective ? 9 : 13] -= 0.08;
        reference.projectionMatrixInverse.copy(reference.projectionMatrix).invert();
        const reflected = reference.projectionMatrix.clone();
        reflected.elements[0] *= -1;
        const input = {
          identity: {
            ...state.identity,
            mirror: mirroredPose,
            camera: {
              ...state.identity.camera,
              projection: perspective ? ("perspective" as const) : ("orthographic" as const),
              viewMatrix: reference.matrixWorldInverse.clone().transpose().toArray(),
              projectionMatrix: reflected.transpose().toArray(),
            },
          },
        };
        const before = JSON.stringify(input);
        const final = searchCamera(
          finalReviewCamera(input, frame),
          frame.referenceAspect,
          initialObservation(),
        );
        const raw = searchCamera(
          solvedCamera(input, frame),
          frame.referenceAspect,
          initialObservation(),
        );
        const right = new THREE.Vector3().setFromMatrixColumn(reference.matrixWorld, 0);
        const center = new THREE.Vector3(...frame.target);
        const point = center
          .clone()
          .addScaledVector(right, 0.4)
          .add(new THREE.Vector3(0, 0.13, 0));
        expect(point.clone().project(raw).x).toBeLessThan(center.clone().project(raw).x);
        expect(point.clone().project(final).x).toBeGreaterThan(center.clone().project(final).x);
        const actualPoint = point.clone().project(final).toArray();
        point
          .clone()
          .project(reference)
          .toArray()
          .forEach((value, i) => {
            expect(actualPoint[i]).toBeCloseTo(value, 10);
          });
        expect(final.projectionMatrix.toArray()).toEqual(reference.projectionMatrix.toArray());
        expect(JSON.stringify(input)).toBe(before);
        expect(solvedCamera(input, frame).projectionMatrix[0]).toBeLessThan(0);
        // Rotation, zoom, viewport changes and reset must follow a physical
        // (unreflected) camera, with no independent transformation of the body.
        const physical = solvedCamera(input, frame);
        physical.projectionMatrix = reference.projectionMatrix.toArray();
        for (const observation of [
          { ...initialObservation(), yaw: -0.4, pitch: 0.2, zoom: 1.6 },
          { ...initialObservation(), yaw: 0.8, pitch: -0.3, zoom: 0.7 },
          initialObservation(),
        ]) {
          const actual = searchCamera(finalReviewCamera(input, frame), 1.8, observation);
          const expected = searchCamera(physical, 1.8, observation);
          expect(actual.matrixWorld.toArray()).toEqual(expected.matrixWorld.toArray());
          expect(actual.projectionMatrix.toArray()).toEqual(expected.projectionMatrix.toArray());
        }
      }
});

it("leaves an already unreflected final camera and its crop unchanged", async () => {
  const { state } = await loadSolvedPacket(fixture.packet, {
    operationId: "op_fixture",
    revision: 1,
    stateHash: fixture.packet.stateHash,
    personIndex: 0,
    candidateId: "candidate",
  });
  const frame = {
    target: [0, 0, 0] as [number, number, number],
    referenceAspect: 1,
    projectionIncludesCenterScaleCrop: true as const,
  };
  expect(finalReviewCamera(state, frame)).toEqual(solvedCamera(state, frame));
});
