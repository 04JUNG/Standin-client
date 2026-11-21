import * as THREE from "three";
import { cameraSchema, type SearchCamera } from "./contract";
export type Observation = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
export const initialObservation = (): Observation => ({
  yaw: 0,
  pitch: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
});
export function searchCamera(raw: SearchCamera, aspect: number, observation: Observation) {
  const spec = cameraSchema.parse(raw);
  const view = new THREE.Matrix4().fromArray(spec.viewMatrix);
  const projection = new THREE.Matrix4().fromArray(spec.projectionMatrix);
  if (Math.abs(view.determinant()) < 1e-12 || Math.abs(projection.determinant()) < 1e-12)
    throw Error("invalid camera matrices");
  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  const world = spec.baked === "view" ? new THREE.Matrix4() : view.clone().invert();
  const target = new THREE.Vector3(...spec.target);
  const position = new THREE.Vector3().setFromMatrixPosition(world);
  const right = new THREE.Vector3().setFromMatrixColumn(world, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(world, 1).normalize();
  // Search projections may mirror X. Keep observation controls screen-relative
  // without changing the canonical projection or its reset/search framing.
  const horizontalDirection = projection.elements[0] < 0 ? -1 : 1;
  const orbit = new THREE.Quaternion()
    .setFromAxisAngle(up, observation.yaw * horizontalDirection)
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        right,
        THREE.MathUtils.clamp(observation.pitch, -1.5, 1.5),
      ),
    );
  const pan = right
    .multiplyScalar(observation.panX * horizontalDirection)
    .add(up.multiplyScalar(observation.panY))
    .applyQuaternion(orbit);
  const offset = position.clone().sub(target).applyQuaternion(orbit);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(world).premultiply(orbit);
  camera.matrixWorld.compose(
    target.clone().add(offset).add(pan),
    rotation,
    new THREE.Vector3(1, 1, 1),
  );
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  // Preserve off-axis center/crop; only adapt horizontal field to the viewport aspect.
  projection.elements[0] *= spec.referenceAspect / Math.max(0.01, aspect);
  projection.elements[0] *= observation.zoom;
  projection.elements[5] *= observation.zoom;
  camera.projectionMatrix.copy(projection);
  camera.projectionMatrixInverse.copy(projection).invert();
  return camera;
}

/** Apply each pointer delta in screen space, using the grabbed surface depth for perspective. */
export function dragModel(
  spec: SearchCamera,
  width: number,
  height: number,
  observation: Observation,
  anchor: THREE.Vector3,
  dx: number,
  dy: number,
): Observation {
  // Remove only the horizontal component close to vertical; diagonals keep both motions.
  const horizontal = Math.sign(dx) * Math.max(0, Math.abs(dx) - Math.abs(dy) * 0.15);
  const next = { ...observation, yaw: observation.yaw - horizontal * 0.012 };
  if (!dy) return next;

  const camera = searchCamera(spec, width / height, next);
  const local = anchor.clone().applyMatrix4(camera.matrixWorldInverse);
  const clip = local.clone().applyMatrix4(camera.projectionMatrix);
  clip.y -= (2 * dy) / height;
  const shifted = clip.applyMatrix4(camera.projectionMatrixInverse);
  const panY = next.panY + local.y - shifted.y;
  return Number.isFinite(panY) ? { ...next, panY } : next;
}
