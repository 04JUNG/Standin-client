import * as THREE from "three";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "./previewStyle";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateModel, validRotation, type CandidateModel } from "./modelContract";

// All cards share a single context and render once. There is no animation loop.
let renderer: THREE.WebGLRenderer | undefined;
let queue: Promise<unknown> = Promise.resolve();
function getRenderer() {
  if (renderer?.getContext().isContextLost()) {
    renderer.dispose();
    renderer = undefined;
  }
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(384, 384, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    window.addEventListener(
      "pagehide",
      () => {
        renderer?.dispose();
        renderer = undefined;
      },
      { once: true },
    );
  }
  return renderer;
}

export function renderCandidate(
  data: ArrayBuffer,
  model: CandidateModel,
  characterId: string,
  signal?: AbortSignal,
): Promise<string> {
  const render = async () => {
    signal?.throwIfAborted();
    validateModel(data, model.sourceSha, characterId);
    if (!validRotation(model.rotation)) throw new Error("invalid candidate camera");
    const loader = new GLTFLoader();
    // Fail closed even if a future parser adds an external glTF resource type.
    loader.manager.setURLModifier(() => {
      throw new Error("external model resource");
    });
    const gltf = await loader.parseAsync(data, "");
    const body = gltf.scene;
    try {
      signal?.throwIfAborted();
      const m = model.rotation;
      body.applyMatrix4(
        new THREE.Matrix4().set(
          m[0]![0]!,
          m[0]![1]!,
          m[0]![2]!,
          0,
          m[1]![0]!,
          m[1]![1]!,
          m[1]![2]!,
          0,
          m[2]![0]!,
          m[2]![1]!,
          m[2]![2]!,
          0,
          0,
          0,
          0,
          1,
        ),
      );
      body.updateMatrixWorld(true);
      const points: THREE.Vector3[] = [];
      body.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
            material.dispose();
          obj.material = libraryPreviewMaterial();
          const position = obj.geometry.getAttribute("position");
          for (let i = 0; i < position.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(obj.matrixWorld);
            if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error("invalid model geometry");
            points.push(p);
          }
        }
      });
      if (!points.length) throw new Error("empty model");
      const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      const radius = Math.max(...points.map((p) => p.distanceTo(center)));
      if (!Number.isFinite(radius) || radius <= 0) throw new Error("invalid model bounds");
      const half = (radius * 2.25) / 2;
      const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, radius * 20);
      camera.position.copy(center).add(new THREE.Vector3(0, 0, radius * 5));
      camera.lookAt(center);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(PREVIEW_BACKGROUND);
      scene.add(body);
      const output = getRenderer();
      output.render(scene, camera);
      return output.domElement.toDataURL("image/png");
    } finally {
      body.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
            material.dispose();
        }
      });
    }
  };
  const result = queue.then(render, render);
  queue = result.catch(() => undefined);
  return result;
}
