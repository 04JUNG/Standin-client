import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateModel, validRotation, type CandidateModel } from "./modelContract";

export type ReviewModel = {
  data: ArrayBuffer;
  characterId: string;
  scope: string;
  base?: CandidateModel;
};

/** Keep the validated surface on the GPU until review closes; draw only on resize. */
export async function mountReviewModel(
  canvas: HTMLCanvasElement,
  model: ReviewModel,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  validateModel(
    model.data,
    model.base?.sourceSha,
    model.characterId,
    model.scope,
    model.base ? "posed-mesh-v1" : "framed-mesh-v1",
  );
  const loader = new GLTFLoader();
  loader.manager.setURLModifier(() => {
    throw new Error("external model resource");
  });
  const { scene: body } = await loader.parseAsync(model.data, "");
  let renderer: THREE.WebGLRenderer | undefined;
  let observer: ResizeObserver | undefined;
  const dispose = () => {
    observer?.disconnect();
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    renderer?.dispose();
    renderer?.forceContextLoss();
  };
  try {
    signal.throwIfAborted();
    if (model.base) {
      const m = model.base.rotation;
      if (!validRotation(m)) throw new Error("invalid rotation");
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
    }
    body.updateMatrixWorld(true);
    const points: THREE.Vector3[] = [];
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const positions = o.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(o.matrixWorld);
          if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error("invalid geometry");
          points.push(p);
        }
      }
    });
    const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
    const radius = points.reduce((r, p) => Math.max(r, p.distanceTo(center)), 0);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error("invalid bounds");
    const half = (radius * 2.25) / 2;
    const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, radius * 20);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, radius * 5));
    camera.lookAt(center);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#999999");
    scene.add(body, new THREE.HemisphereLight(0xffffff, 0x555568, 2));
    for (const [x, y, z, intensity] of [
      [-2, 3, 4, 2.5],
      [3, 1, -2, 0.8],
    ]) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.copy(center).add(new THREE.Vector3(x! * radius, y! * radius, z! * radius));
      light.target.position.copy(center);
      scene.add(light, light.target);
    }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      const width = Math.max(1, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight);
      const aspect = width / height;
      camera.left = -half * Math.max(1, aspect);
      camera.right = -camera.left;
      camera.top = half / Math.min(1, aspect);
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      renderer!.setSize(width, height, false);
      renderer!.render(scene, camera);
    };
    draw();
    observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
