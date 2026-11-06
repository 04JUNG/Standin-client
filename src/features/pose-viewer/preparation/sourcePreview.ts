import * as THREE from "three";
import { apiFetchResponse } from "@/shared/api/client";
import { boundedBytes, verifyBytes, BoundedQueue } from "../interactive/assets";
import { referencePose } from "../preview/humanReference/pose";
import type { HumanTemplate } from "../preview/humanReference/template";
import { libraryPreviewMaterial } from "../preview/previewStyle";
import type { SurfaceView } from "../interactive/InteractivePose";
import type { SourcePreview } from "./contract";
const downloads = new BoundedQueue(2);
export async function loadPreparedSource(asset: SourcePreview, signal: AbortSignal) {
  return downloads.run(async () => {
    const response = await apiFetchResponse(asset.url, { auth: false, cache: "no-store", signal });
    const bytes = await boundedBytes(response, asset.bytes, signal);
    if (bytes.byteLength !== asset.bytes) throw Error("source size changed");
    await verifyBytes(bytes, asset.sha256);
    signal.throwIfAborted();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.startsWith("HIERARCHY")) throw Error("source is not BVH");
    return { text, sha256: asset.sha256 };
  }, signal);
}
/** Approved shared display rig only. Search rotation/projection with display-only comparison framing. Never loads or applies the selected body/shape/hands. */
export function sourceSurface(
  template: HumanTemplate,
  text: string,
  sha256: string,
  sourceCamera?: SourcePreview["camera"],
): SurfaceView & { dispose(): void } {
  const { matrices } = referencePose(template, text);
  const body = new THREE.Group(),
    material = libraryPreviewMaterial();
  const geometries: THREE.BufferGeometry[] = [];
  const point = new THREE.Vector3(),
    mixed = new THREE.Vector3();
  for (const mesh of template.meshes) {
    const positions = new Float32Array(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      mixed.set(0, 0, 0);
      for (let k = 0; k < 8; k++) {
        const weight = mesh.skinWeights[i * 8 + k];
        if (!weight) continue;
        point.fromArray(mesh.positions, i * 3).applyMatrix4(matrices[mesh.skinIndices[i * 8 + k]]);
        mixed.addScaledVector(point, weight);
      }
      mixed.toArray(positions, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(mesh.triangles);
    geometry.computeVertexNormals();
    geometries.push(geometry);
    body.add(new THREE.Mesh(geometry, material));
  }
  if (sourceCamera) {
    const r = sourceCamera.rotation;
    body.applyMatrix4(
      new THREE.Matrix4().set(
        r[0][0],
        r[0][1],
        r[0][2],
        0,
        r[1][0],
        r[1][1],
        r[1][2],
        0,
        r[2][0],
        r[2][1],
        r[2][2],
        0,
        0,
        0,
        0,
        1,
      ),
    );
  }
  body.scale.z *= -1;
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body),
    center = box.getCenter(new THREE.Vector3());
  const extent = box.getSize(new THREE.Vector3());
  const half = Math.max(extent.x, extent.y, 0.2) * 0.6;
  let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  const perspective = sourceCamera?.projection === "perspective";
  if (perspective) {
    const head = (role: string) =>
      new THREE.Vector3().fromArray(template.joints.find((j) => j.role === role)!.head);
    const torso = head("upperarm.L")
      .add(head("upperarm.R"))
      .multiplyScalar(0.5)
      .distanceTo(head("upleg.L").add(head("upleg.R")).multiplyScalar(0.5));
    const distance = (sourceCamera?.distance_torso ?? 0) * torso;
    const projected = new THREE.Box2();
    try {
      body.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const vertices = node.geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld);
          const depth = distance - point.z;
          if (!Number.isFinite(depth) || depth <= 0.01) throw Error("display camera depth");
          projected.expandByPoint(new THREE.Vector2(point.x / depth, point.y / depth));
        }
      });
      const size = projected.getSize(new THREE.Vector2()),
        fit = Math.max(size.x, size.y, 0.01) * 0.6;
      const offset = projected.getCenter(new THREE.Vector2());
      camera = new THREE.PerspectiveCamera(
        THREE.MathUtils.radToDeg(2 * Math.atan(fit)),
        1,
        0.01,
        100,
      );
      camera.position.z = distance;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = offset.x / fit;
      camera.projectionMatrix.elements[9] = offset.y / fit;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    } catch (error) {
      geometries.forEach((g) => g.dispose());
      material.dispose();
      throw error;
    }
  } else {
    camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 100);
    camera.position.set(center.x, center.y, center.z + 10);
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  // Keep pose origin intact; projection center is represented by view translation.
  return {
    body,
    camera: {
      schemaVersion: "interactive-camera-v1",
      projection: perspective ? "perspective" : "orthographic",
      viewMatrix: camera.matrixWorldInverse.toArray(),
      projectionMatrix: camera.projectionMatrix.toArray(),
      matrixLayout: "column-major",
      basis: "right-handed-Y-up",
      clipSpace: "webgl-minus-one-to-one",
      origin: "hips",
      units: "meters",
      distanceTorso: perspective ? sourceCamera!.distance_torso! : null,
      torsoReferenceSha256: sha256,
      target: center.toArray(),
      referenceAspect: 1,
      framing: "projection-includes-center-scale-crop",
      baked: "none",
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      material.dispose();
    },
  };
}
