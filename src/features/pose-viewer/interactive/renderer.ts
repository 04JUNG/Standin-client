import * as THREE from "three";
import { PREVIEW_BACKGROUND } from "../preview/previewStyle";
import { searchCamera, type Observation } from "./camera";
import type { SearchCamera } from "./contract";
import { measure } from "./metrics";

type View = {
  element: HTMLElement;
  scene: THREE.Scene;
  camera: SearchCamera;
  observation: () => Observation;
  layer: number;
  ready(): void;
  failed(): void;
};
const views = new Set<View>();
let output: THREE.WebGLRenderer | undefined;
let scheduled = 0;
let drawCount = 0;
let observer: ResizeObserver | undefined;
function lost(event: Event) {
  event.preventDefault();
  measure("context-loss", performance.now());
  for (const view of views) view.failed();
}
function restored() {
  invalidate();
}
function getOutput() {
  if (!output) {
    output = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    output.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    output.outputColorSpace = THREE.SRGBColorSpace;
    output.toneMapping = THREE.NoToneMapping;
    Object.assign(output.domElement.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: "10",
    });
    output.domElement.setAttribute("aria-hidden", "true");
    output.domElement.setAttribute("data-replay-private", "true");
    output.domElement.addEventListener("webglcontextlost", lost);
    output.domElement.addEventListener("webglcontextrestored", restored);
    document.body.appendChild(output.domElement);
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("pagehide", shutdown);
    observer = new ResizeObserver(invalidate);
  }
  return output;
}
function clipRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left),
    top = Math.max(0, rect.top),
    right = Math.min(innerWidth, rect.right),
    bottom = Math.min(innerHeight, rect.bottom);
  for (let p = element.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left);
      top = Math.max(top, r.top);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { rect, left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function draw() {
  scheduled = 0;
  if (!output || !views.size || output.getContext().isContextLost()) return;
  const started = performance.now();
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  if (output.getPixelRatio() !== pixelRatio) output.setPixelRatio(pixelRatio);
  output.setSize(innerWidth, innerHeight, false);
  output.setScissorTest(false);
  output.setClearColor(0, 0);
  output.clear();
  output.setScissorTest(true);
  const layer = Math.max(...[...views].map((v) => v.layer));
  const parent =
    [...views].find((v) => v.layer === layer)?.element.closest("[data-interactive-render-layer]") ??
    document.body;
  if (output.domElement.parentElement !== parent) parent.appendChild(output.domElement);
  for (const view of views) {
    if (view.layer !== layer) continue;
    const { rect, left, top, width, height } = clipRect(view.element);
    if (!width || !height || !rect.width || !rect.height) continue;
    try {
      const camera = searchCamera(view.camera, rect.width / rect.height, view.observation());
      output.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
      output.setScissor(left, innerHeight - top - height, width, height);
      output.setClearColor(PREVIEW_BACKGROUND, 1);
      output.clear();
      output.render(view.scene, camera);
      view.ready();
    } catch {
      view.failed();
    }
  }
  drawCount++;
  measure("frame", started);
}
export function invalidate() {
  if (!scheduled) scheduled = requestAnimationFrame(draw);
}
export function registerView(view: Omit<View, "scene"> & { body: THREE.Group }) {
  getOutput();
  const scene = new THREE.Scene();
  scene.add(view.body);
  const registered: View = { ...view, scene };
  views.add(registered);
  observer!.observe(view.element);
  invalidate();
  return () => {
    views.delete(registered);
    observer?.unobserve(view.element);
    scene.clear();
    if (!views.size) shutdown();
    else invalidate();
  };
}
/** Capture only the registered mannequin rectangle, synchronously after this revision's draw. */
export async function captureView(element: HTMLElement): Promise<Blob> {
  const view = [...views].find((v) => v.element === element);
  if (
    !view ||
    !output ||
    output.getContext().isContextLost() ||
    view.layer !== Math.max(...[...views].map((v) => v.layer))
  )
    throw Error("view unavailable");
  const clipping = clipRect(element);
  if (
    Math.abs(clipping.width - clipping.rect.width) > 1 ||
    Math.abs(clipping.height - clipping.rect.height) > 1
  )
    throw Error("view clipped");
  // Draw and copy in the same task; no DOM/rough/OS capture or preserveDrawingBuffer loop.
  if (scheduled) {
    cancelAnimationFrame(scheduled);
    scheduled = 0;
  }
  draw();
  const rect = element.getBoundingClientRect();
  if (
    rect.width < 1 ||
    rect.height < 1 ||
    rect.left < 0 ||
    rect.top < 0 ||
    rect.right > innerWidth ||
    rect.bottom > innerHeight
  )
    throw Error("view clipped");
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(512, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round((canvas.width * rect.height) / rect.width));
  const scale = output.getPixelRatio();
  canvas
    .getContext("2d")!
    .drawImage(
      output.domElement,
      rect.left * scale,
      rect.top * scale,
      rect.width * scale,
      rect.height * scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(Error("capture failed"))), "image/png"),
  );
}
export function rendererResources() {
  return {
    contexts: output ? 1 : 0,
    views: views.size,
    draws: drawCount,
    geometries: output?.info.memory.geometries ?? 0,
    textures: output?.info.memory.textures ?? 0,
  };
}
export function shutdown() {
  if (scheduled) cancelAnimationFrame(scheduled);
  scheduled = 0;
  observer?.disconnect();
  observer = undefined;
  window.removeEventListener("resize", invalidate);
  window.removeEventListener("scroll", invalidate, true);
  window.removeEventListener("pagehide", shutdown);
  if (output) {
    output.domElement.removeEventListener("webglcontextlost", lost);
    output.domElement.removeEventListener("webglcontextrestored", restored);
    output.domElement.remove();
    output.dispose();
    output.forceContextLoss();
    output = undefined;
  }
  // GPU resources are gone; keep the bounded immutable CPU cache warm across main↔bar remounts.
}
/** Primitive display-only camera metadata for auxiliary frame provenance. */
export function observationForView(element: HTMLElement) {
  const view = [...views].find((v) => v.element === element);
  if (!view) throw Error("view unavailable");
  return { ...view.observation() };
}
