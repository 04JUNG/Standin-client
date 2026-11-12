import * as THREE from "three";
import { referencePose } from "./pose";
import type { HumanTemplate } from "./template";
import type { SearchCamera } from "../../interactive/contract";
import { referenceMesh } from "./referenceMesh";
import { sourceFingerPose, type FingerSkin } from "./sourceFingers";
import { validRotation } from "../modelContract";
import { correctApprovedPose, type Correctives } from "./correctives";

export function referenceSurface(
  template: HumanTemplate,
  text: string,
  skin?: FingerSkin,
  corrections?: Correctives,
) {
  let base = referencePose(template, text, !!corrections);
  if (corrections) {
    const corrected = correctApprovedPose(template, base, corrections);
    template = corrected.template;
    base = corrected.pose;
  }
  const fingers = skin && sourceFingerPose(template, text, base, skin);
  const surface = fingers
    ? referenceMesh(fingers.template, fingers.matrices, fingers.wrists)
    : referenceMesh(template, base.matrices);
  // PSDs alter the surface, so neutral normals no longer describe the joints.
  if (corrections)
    for (const mesh of surface.body.children) (mesh as THREE.Mesh).geometry.computeVertexNormals();
  return surface;
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
