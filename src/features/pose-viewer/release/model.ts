import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { releaseCamera, type ReleaseCamera } from "./camera";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "../preview/previewStyle";
export async function mountReleaseModel(
  canvas: HTMLCanvasElement,
  data: ArrayBuffer,
  c: ReleaseCamera,
  signal: AbortSignal,
) {
  const loader = new GLTFLoader();
  loader.manager.setURLModifier(() => {
    throw new Error("external resource");
  });
  const { scene: body } = await loader.parseAsync(data, "");
  signal.throwIfAborted();
  body.rotation.x = Math.PI / 2; // GLB Y-up metres -> Blender Z-up metres
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      o.material = libraryPreviewMaterial();
    }
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BACKGROUND);
  scene.add(body);
  const camera = releaseCamera(c);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const draw = () => {
    const w = Math.max(1, canvas.clientWidth),
      h = Math.max(1, canvas.clientHeight),
      aspect = c.image_size[0] / c.image_size[1];
    renderer.setSize(w, h, false);
    renderer.setScissorTest(false);
    renderer.clear();
    const vw = Math.min(w, h * aspect),
      vh = vw / aspect;
    renderer.setViewport((w - vw) / 2, (h - vh) / 2, vw, vh);
    renderer.render(scene, camera);
  };
  draw();
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  return Object.assign(
    () => {
      observer.disconnect();
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
    { setOutlineWidth: (_width: number) => {} },
  );
}
