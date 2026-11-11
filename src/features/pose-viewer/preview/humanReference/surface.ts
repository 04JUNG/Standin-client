import * as THREE from "three";
import { referencePose } from "./pose";
import type { HumanTemplate } from "./template";
import type { SearchCamera } from "../../interactive/contract";
import { referenceMesh } from "./referenceMesh";
import { sourceFingerPose, type FingerSkin } from "./sourceFingers";
import { validRotation } from "../modelContract";

export function referenceSurface(template: HumanTemplate, text: string, skin?: FingerSkin) {
  const base = referencePose(template, text);
  const fingers = skin && sourceFingerPose(template, text, base, skin);
  return fingers
    ? referenceMesh(fingers.template, fingers.matrices)
    : referenceMesh(template, base.matrices);
}

export function referenceSurfaceCamera(
  surface: ReturnType<typeof referenceSurface>,
  yaw = 0,
  rotation?: number[][],
): SearchCamera {
  const target = surface.bounds.getCenter(new THREE.Vector3());
  const size = surface.bounds.getSize(new THREE.Vector3());
  const half = Math.max(size.x, size.y, size.z, 0.01) * 0.65;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, 200);
  if (validRotation(rotation)) {
    // Search rotates model coordinates. Orbit the camera by the inverse so the pose stays fixed.
    const [x, y, z] = rotation;
    const worldRotation = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...x),
      new THREE.Vector3(...y),
      new THREE.Vector3(...z),
    );
    camera.quaternion.setFromRotationMatrix(worldRotation);
  } else {
    // Poster yaw is also in search coordinates. Zero starts at the template's +Z front.
    camera.rotateY(THREE.MathUtils.degToRad(-yaw));
  }
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 10).applyQuaternion(camera.quaternion));
  camera.updateMatrixWorld();
  return {
    schemaVersion: "interactive-camera-v1",
    projection: "orthographic",
    viewMatrix: camera.matrixWorldInverse.toArray(),
    projectionMatrix: camera.projectionMatrix.toArray(),
    matrixLayout: "column-major",
    basis: "right-handed-Y-up",
    clipSpace: "webgl-minus-one-to-one",
    origin: "hips",
    units: "meters",
    distanceTorso: null,
    torsoReferenceSha256: surface.characterSha,
    target: target.toArray(),
    referenceAspect: 1,
    framing: "projection-includes-center-scale-crop",
    baked: "none",
  };
}
