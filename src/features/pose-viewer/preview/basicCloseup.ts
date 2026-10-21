import * as THREE from "three";
import type { HumanTemplate } from "./humanReference/template";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "./previewStyle";

let queue: Promise<unknown> = Promise.resolve();

/** The template already contains the Converter's anatomical crop. Neutral rest
 * coordinates need no retarget, inferred joints, skin deformation or screen crop.
 * Keep this separate from the pinned library-poster renderer/bake contract.
 */
export function basicCloseupScene(template: HumanTemplate) {
  if (!["head", "shoulder_head"].includes(template.scope))
    throw Error("지원하지 않는 기본 클로즈업 범위입니다.");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BACKGROUND);
  const material = libraryPreviewMaterial();
  for (const mesh of template.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
    geometry.setIndex(mesh.triangles);
    scene.add(new THREE.Mesh(geometry, material));
  }
  const bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3());
  const half = Math.max(extent.x, extent.y) * 0.57;
  if (
    bounds.isEmpty() ||
    ![half, ...center.toArray(), ...extent.toArray()].every(Number.isFinite) ||
    half <= 0 ||
    extent.length() > 100
  ) {
    dispose();
    throw Error("기본 클로즈업 메시를 확인하지 못했습니다.");
  }
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, 200);
  camera.position.copy(center).add(new THREE.Vector3(0, 0, extent.z + 10));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  function dispose() {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    material.dispose();
  }
  return { scene, camera, bounds, dispose };
}

export function renderBasicCloseup(template: HumanTemplate, signal: AbortSignal): Promise<string> {
  const render = () => {
    signal.throwIfAborted();
    const { scene, camera, dispose } = basicCloseupScene(template);
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(384, 384, false);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      const image = renderer.domElement.toDataURL("image/png");
      signal.throwIfAborted();
      return image;
    } finally {
      dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    }
  };
  const result = queue.then(render, render);
  queue = result.catch(() => {});
  return result;
}
