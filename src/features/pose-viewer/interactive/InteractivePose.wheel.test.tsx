import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InteractivePose } from "./InteractivePose";
import { Group } from "three";
import { pickPoseSurface, registerView } from "./renderer";
import type { SearchCamera } from "./contract";
vi.mock("./renderer", () => ({
  invalidate: vi.fn(),
  registerView: vi.fn(),
  pickPoseSurface: vi.fn(),
}));
it("large viewport consumes wheel default scrolling and removes the listener when leaving large mode", () => {
  const r = render(<InteractivePose viewKey="wheel-boundary" large />),
    target = screen.getByRole("application");
  const large = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
  fireEvent(target, large);
  expect(large.defaultPrevented).toBe(true);
  r.rerender(<InteractivePose viewKey="wheel-boundary" />);
  const small = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
  fireEvent(target, small);
  expect(small.defaultPrevented).toBe(false);
  r.unmount();
});

it("rotates without panning when dragging the model with Shift in the fixed-body preview", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback([{ isIntersecting: true }] as IntersectionObserverEntry[], this as never);
      }
      disconnect() {}
    },
  );
  try {
    vi.mocked(registerView).mockImplementation((view) => {
      view.ready();
      return () => {};
    });
    const { unmount } = render(
      <InteractivePose
        large
        rotationOnly
        viewKey="rotation-only"
        surface={{ body: new Group(), camera: {} as SearchCamera }}
      />,
    );
    await waitFor(() => expect(registerView).toHaveBeenCalled());
    const target = screen.getByRole("application");
    target.setPointerCapture = vi.fn();
    target.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, shiftKey: true });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(target, event);
    };
    pointer("pointerdown", 10, 10);
    pointer("pointermove", 25, 40);
    pointer("pointerup", 25, 40);
    const view = vi.mocked(registerView).mock.lastCall![0];
    expect(view.observation()).toMatchObject({ yaw: -0.18, pitch: -0.36, panX: 0, panY: 0 });
    expect(pickPoseSurface).not.toHaveBeenCalled();
    unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});
