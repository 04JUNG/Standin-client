import { recordCanvasFrame } from "@/features/replay/canvas";
import * as THREE from "three";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "./previewStyle";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateModel, validRotation, type CandidateModel } from "./modelContract";

export type ReviewModel = {
  data: ArrayBuffer;
  characterId: string;
  scope: string;
  base?: CandidateModel;
  version?: "posed-mesh-v1" | "framed-mesh-v1";
  sourceSha?: string;
  characterSha256?: string;
  modelRevision?: string;
  turnDegrees?: number;
  shapeSha256?: string | null;
};

/** Keep the validated surface on the GPU until review closes; draw only on resize. */
export async function mountReviewModel(
  canvas: HTMLCanvasElement,
  model: ReviewModel,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const meta = validateModel(
    model.data,
    model.sourceSha ?? model.base?.sourceSha,
    model.characterId,
    model.scope,
    model.version ?? (model.base ? "posed-mesh-v1" : "framed-mesh-v1"),
  );
  if (
    (model.characterSha256 && meta.character_sha256 !== model.characterSha256) ||
    (model.modelRevision && meta.revision !== model.modelRevision)
  )
    throw new Error("model identity changed");
  if (model.shapeSha256 !== undefined && (meta.shape_sha256 ?? null) !== model.shapeSha256)
    throw new Error("body shape changed");
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
    if (model.turnDegrees) body.rotateY(THREE.MathUtils.degToRad(model.turnDegrees));
    body.updateMatrixWorld(true);
    const points: THREE.Vector3[] = [];
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          material.dispose();
        o.material = libraryPreviewMaterial();
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
    scene.background = new THREE.Color(PREVIEW_BACKGROUND);
    scene.add(body);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
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
      recordCanvasFrame(canvas, {
        preview: "review_model",
        characterId: model.characterId,
        scope: model.scope,
        modelRevision: model.modelRevision,
        sourceSha: model.sourceSha,
        shapeSha256: model.shapeSha256,
      });
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
