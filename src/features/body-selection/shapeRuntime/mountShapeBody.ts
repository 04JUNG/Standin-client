import * as THREE from "three";
import {
  libraryPreviewMaterial,
  PREVIEW_BACKGROUND,
} from "@/features/pose-viewer/preview/previewStyle";
import type { AnyShapeRuntime } from "./format";
import { evaluateShape, type BlenderControls } from "./evaluate";

/**
 * "내 체형" 박스의 실시간 3D. 캔버스 하나에 WebGL 컨텍스트 하나, 값이 바뀔 때만 그린다
 * (애니메이션 루프 없음). 같은 프레임에 여러 번 바뀌면 마지막 값만 계산한다.
 *
 * 화면 틀은 키 195cm·T 포즈 팔 너비가 들어가는 **고정 크기**다. 모델에 맞춰 확대하면 키를
 * 바꿔도 크기가 그대로 보이기 때문이다. Blender z-up → three y-up: (x, y, z) → (x, z, −y).
 */
const FRAME_HEIGHT = 2.02; // m, 바닥 −1cm ~ 2.01m
const FRAME_WIDTH = 1.95; // m
const FRAME_CENTER_Y = 0.995;

export type ShapeBodyView = {
  update(controls: BlenderControls, preset?: string): void;
  setRotation(radians: number): void;
  dispose(): void;
  /** 마지막 계산 시간(ms). 성능 기록용. */
  lastComputeMs(): number;
};

export function mountShapeBody(
  canvas: HTMLCanvasElement,
  runtime: AnyShapeRuntime,
  onLost: () => void,
): ShapeBodyView {
  const V = runtime.header.vertexCount;
  const blender = new Float32Array(V * 3);
  const positions = new Float32Array(V * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(runtime.faces, 1));
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const material = libraryPreviewMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BACKGROUND);
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  camera.position.set(0, FRAME_CENTER_Y, 5);
  camera.lookAt(0, FRAME_CENTER_Y, 0);

  let renderer: THREE.WebGLRenderer | undefined = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const lost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener("webglcontextlost", lost);

  let pending: BlenderControls | null = null;
  let pendingPreset: string | undefined;
  let frame = 0;
  let computeMs = 0;
  let hasBody = false;
  const draw = () => {
    if (!renderer || !hasBody) return;
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    const half = Math.max(FRAME_HEIGHT / 2, FRAME_WIDTH / 2 / aspect);
    camera.top = half;
    camera.bottom = -half;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  };
  const flush = () => {
    frame = 0;
    if (!pending) return;
    const c = pending;
    pending = null;
    const t = performance.now();
    evaluateShape(runtime, c, blender, pendingPreset);
    for (let i = 0; i < V; i++) {
      positions[i * 3] = blender[i * 3]!;
      positions[i * 3 + 1] = blender[i * 3 + 2]!;
      positions[i * 3 + 2] = -blender[i * 3 + 1]!;
    }
    attribute.needsUpdate = true;
    geometry.computeVertexNormals();
    computeMs = performance.now() - t;
    hasBody = true;
    draw();
  };
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);

  return {
    update(controls, preset) {
      pending = controls;
      pendingPreset = preset;
      if (!frame) frame = requestAnimationFrame(flush);
    },
    setRotation(radians) {
      mesh.rotation.y = radians;
      draw();
    },
    lastComputeMs: () => computeMs,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = undefined;
    },
  };
}

/**
 * 카드 썸네일: 체형 한 번을 계산해 PNG로 찍는다. 캔버스·WebGL 컨텍스트는 찍고 바로 버린다
 * (카드가 많아도 컨텍스트가 쌓이지 않게 — 한 장씩 동기로 끝난다). 틀은 실시간 박스와 같은
 * 고정 크기라 카드끼리 키 차이가 그대로 보인다. WebGL을 못 쓰면 던진다(호출 쪽이 고정 그림으로).
 */
export function snapshotShapeBody(
  runtime: AnyShapeRuntime,
  controls: BlenderControls,
  preset?: string,
  width = 240,
  height = 320,
): string {
  const V = runtime.header.vertexCount;
  const blender = new Float32Array(V * 3);
  const positions = new Float32Array(V * 3);
  // 표본(v2) 자산은 프리셋마다 모델이 따로라 프리셋이 있어야 계산한다.
  evaluateShape(runtime, controls, blender, preset);
  for (let i = 0; i < V; i++) {
    positions[i * 3] = blender[i * 3]!;
    positions[i * 3 + 1] = blender[i * 3 + 2]!;
    positions[i * 3 + 2] = -blender[i * 3 + 1]!;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(runtime.faces, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = libraryPreviewMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BACKGROUND);
  scene.add(mesh);
  const aspect = width / height;
  const half = Math.max(FRAME_HEIGHT / 2, FRAME_WIDTH / 2 / aspect);
  const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 20);
  camera.position.set(0, FRAME_CENTER_Y, 5);
  camera.lookAt(0, FRAME_CENTER_Y, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  } finally {
    geometry.dispose();
    material.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
