import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InteractivePose } from "./InteractivePose";
vi.mock("./renderer", () => ({ invalidate: vi.fn(), registerView: vi.fn() }));
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
