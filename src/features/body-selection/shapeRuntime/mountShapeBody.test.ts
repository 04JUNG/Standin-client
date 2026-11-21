import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnyShapeRuntime } from "./format";
import { mountShapeBody } from "./mountShapeBody";

const spies = vi.hoisted(() => ({
  render: vi.fn(),
  evaluate: vi.fn(),
  dispose: vi.fn(),
  compute: vi.fn(),
}));
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
vi.mock("./referenceAsync", () => ({
  computeReferenceAsync: (...args: unknown[]) => spies.compute(...args),
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

describe("reference preview request ordering", () => {
  it("keeps only the latest slider result and ignores a result after disposal", async () => {
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const done: ((result: { positions: Float32Array; computeMs: number }) => void)[] = [];
    spies.compute.mockImplementation(
      () =>
        new Promise((resolve) => {
          done.push(resolve);
        }),
    );
    const view = mountShapeBody(
      document.createElement("canvas"),
      {
        kind: "reference",
        header: { vertexCount: 3 },
        faces: new Uint16Array([0, 1, 2]),
      } as unknown as AnyShapeRuntime,
      vi.fn(),
    );
    view.update({ muscle: 1 });
    frame(0);
    view.update({ muscle: 2 });
    frame(1);
    expect(spies.compute).toHaveBeenCalledTimes(1);
    done[0]({ positions: new Float32Array(9), computeMs: 1 });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(spies.render).not.toHaveBeenCalled();
    frame(2);
    expect(spies.compute).toHaveBeenCalledTimes(2);
    done[1]({ positions: new Float32Array(9), computeMs: 2 });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(spies.render).toHaveBeenCalledOnce();
    expect(view.lastComputeMs()).toBe(2);
    view.update({ muscle: 3 });
    frame(3);
    view.dispose();
    done[2]({ positions: new Float32Array(9), computeMs: 3 });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(spies.render).toHaveBeenCalledOnce();
    expect(spies.evaluate).not.toHaveBeenCalled();
  });
});
