import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { SearchCamera } from "./contract";
import { initialObservation } from "./camera";
import { invalidate, registerView, rendererResources, shutdown } from "./renderer";

const passes = vi.hoisted(() => [] as {
  widths: number[];
  dispose: ReturnType<typeof vi.fn>;
}[]);
vi.mock("../outline/BodyOutlineRenderer", () => ({
  BodyOutlineRenderer: class {
    state = { widths: [] as number[], dispose: vi.fn() };
    constructor() { passes.push(this.state); }
    setWidth(_body: unknown, width: number) { this.state.widths.push(width); }
    render() {}
    dispose() { this.state.dispose(); }
  },
}));
vi.mock("./camera", async (original) => ({
  ...await original<typeof import("./camera")>(),
  searchCamera: () => new THREE.PerspectiveCamera(),
}));
vi.mock("three", async (original) => ({
  ...await original<typeof import("three")>(),
  WebGLRenderer: class {
    domElement = document.createElement("canvas");
    info = { memory: { geometries: 0, textures: 0 } };
    pixelRatio = 1;
    setPixelRatio(value: number) { this.pixelRatio = value; }
    getPixelRatio() { return this.pixelRatio; }
    getContext() { return { isContextLost: () => false }; }
    setSize() {}
    setScissorTest() {}
    setClearColor() {}
    clear() {}
    setViewport() {}
    setScissor() {}
    dispose() {}
    forceContextLoss() {}
  },
}));

afterEach(() => {
  shutdown();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  passes.length = 0;
});

it("isolates large-pane skin and outline from cards and preserves their outline after pane cleanup", () => {
  let pending: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => { pending = undefined; });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const flush = () => { const callback = pending; pending = undefined; callback?.(0); };
  const original = new THREE.ShaderMaterial({
    fragmentShader: "uniform vec3 ambient, light; void main() { vec3 c = 0.72 * (ambient + light); }",
  });
  const makeView = () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
    document.body.appendChild(element);
    const body = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), original);
    body.add(mesh);
    return { element, body, mesh, camera: {} as SearchCamera, observation: initialObservation,
      layer: 0, ready: vi.fn(), failed: vi.fn() };
  };
  const card = makeView(), pane = makeView();
  let appearance = { skin: "flesh" as "flesh" | "default", outlineWidth: 1.4 };
  const removeCard = registerView({ ...card, outlineWidth: () => 0.65 });
  const removePane = registerView({ ...pane, outlineWidth: () => 2, appearance: () => appearance });
  flush();
  expect(passes).toHaveLength(2);
  expect(passes[0].widths.at(-1)).toBe(0.65);
  expect(passes[1].widths.at(-1)).toBe(1.4);
  expect(card.mesh.material).not.toBe(pane.mesh.material);
  expect(original.uniforms.baseColor).toBeUndefined();
  expect(card.mesh.material.uniforms.baseColor.value.toArray()).toEqual([0.72, 0.72, 0.72]);
  expect(pane.mesh.material.uniforms.baseColor.value.toArray()).not.toEqual([0.72, 0.72, 0.72]);
  appearance = { skin: "default", outlineWidth: 0 };
  invalidate();
  flush();
  expect(passes[1].widths.at(-1)).toBe(0);
  removePane();
  flush();
  expect(passes[1].dispose).toHaveBeenCalledTimes(1);
  expect(passes[0].dispose).not.toHaveBeenCalled();
  expect(passes[0].widths.at(-1)).toBe(0.65);
  expect(rendererResources().views).toBe(1);
  removeCard();
  expect(passes[0].dispose).toHaveBeenCalledTimes(1);
  expect(rendererResources().contexts).toBe(0);
  expect(rendererResources().views).toBe(0);
});
