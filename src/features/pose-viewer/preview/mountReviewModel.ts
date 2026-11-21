import { mountReleaseModel } from "../release/model";
import type { ReleaseCamera } from "../release/camera";
import { recordCanvasFrame } from "@/features/replay/canvas";
import * as THREE from "three";
import { libraryPreviewMaterial, PREVIEW_BACKGROUND } from "./previewStyle";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateModel, validRotation, type CandidateModel } from "./modelContract";
import { BodyOutlineRenderer } from "../outline/BodyOutlineRenderer";

export type ReviewModel = {
  format?: "fbx";
  releaseCamera?: ReleaseCamera;
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

/** Keep the validated surface on the GPU; redraw on resize or preview width changes. */
export async function mountReviewModel(
  canvas: HTMLCanvasElement,
  model: ReviewModel,
  signal: AbortSignal,
  outlineWidth = 0,
) {
  signal.throwIfAborted();
  if (model.releaseCamera)
    return mountReleaseModel(canvas, model.data, model.releaseCamera, signal);
  const meta =
    model.format === "fbx"
      ? undefined
      : validateModel(
          model.data,
          model.sourceSha ?? model.base?.sourceSha,
          model.characterId,
          model.scope,
          model.version ?? (model.base ? "posed-mesh-v1" : "framed-mesh-v1"),
        );
  if (
    meta &&
    ((model.characterSha256 && meta.character_sha256 !== model.characterSha256) ||
      (model.modelRevision && meta.revision !== model.modelRevision))
  )
    throw new Error("model identity changed");
  if (meta && model.shapeSha256 !== undefined && (meta.shape_sha256 ?? null) !== model.shapeSha256)
    throw new Error("body shape changed");
  const loader = new GLTFLoader();
  loader.manager.setURLModifier(() => {
    throw new Error("external model resource");
  });
  const body =
    model.format === "fbx"
      ? (await import("./finalFbxScene")).parseFinalFbx(model.data)
      : (await loader.parseAsync(model.data, "")).scene;
  let renderer: THREE.WebGLRenderer | undefined;
  let observer: ResizeObserver | undefined;
  let outline: BodyOutlineRenderer | undefined;
  let controls: OrbitControls | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    controls?.dispose();
    outline?.dispose();
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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    outline = new BodyOutlineRenderer(renderer);
    outline.setWidth(body, outlineWidth);
    const draw = () => {
      if (disposed) return;
      const width = Math.max(1, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight);
      const aspect = width / height;
      camera.left = -half * Math.max(1, aspect);
      camera.right = -camera.left;
      camera.top = half / Math.min(1, aspect);
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      renderer!.setSize(width, height, false);
      outline!.render(scene, camera);
      recordCanvasFrame(canvas, {
        preview: "review_model",
        characterId: model.characterId,
        scope: model.scope,
        modelRevision: model.modelRevision,
        sourceSha: model.sourceSha,
        shapeSha256: model.shapeSha256,
      });
    };
    if (model.format === "fbx") {
      controls = new OrbitControls(camera, canvas);
      controls.target.copy(center);
      controls.enablePan = false;
      controls.minZoom = 0.5;
      controls.maxZoom = 8;
      controls.addEventListener("change", draw);
      controls.update();
    }
    draw();
    observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return Object.assign(dispose, {
      setOutlineWidth(width: number) {
        if (disposed) return;
        outline!.setWidth(body, width);
        outline!.render(scene, camera);
      },
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
