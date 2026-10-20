import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnyShapeRuntime } from "./format";
import { mountShapeBody } from "./mountShapeBody";

const spies = vi.hoisted(() => ({ render: vi.fn(), evaluate: vi.fn(), dispose: vi.fn() }));
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    setPixelRatio() {}
    setSize() {}
    render = spies.render;
    dispose = spies.dispose;
    forceContextLoss() {}
  },
}));
vi.mock("./evaluate", () => ({ evaluateShape: (...args: unknown[]) => spies.evaluate(...args) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("shape preview rotation", () => {
  it("rotates a full turn without recalculating shape and retains the angle across value updates", () => {
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    const canvas = document.createElement("canvas");
    const view = mountShapeBody(
      canvas,
      {
        header: { vertexCount: 3 },
        faces: new Uint32Array([0, 1, 2]),
      } as unknown as AnyShapeRuntime,
      vi.fn(),
    );
    view.update({ height: 1.8 }, "BASE");
    frame(0);
    expect(spies.evaluate).toHaveBeenCalledTimes(1);
    view.setRotation(Math.PI * 2);
    const scene = spies.render.mock.calls.at(-1)![0] as import("three").Scene;
    expect(scene.children[0]!.rotation.y).toBe(Math.PI * 2);
    expect(spies.evaluate).toHaveBeenCalledTimes(1);
    view.update({ height: 1.9 }, "BASE");
    frame(1);
    expect(scene.children[0]!.rotation.y).toBe(Math.PI * 2);
    expect(spies.evaluate).toHaveBeenCalledTimes(2);
    view.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(spies.dispose).toHaveBeenCalledOnce();
  });
});
