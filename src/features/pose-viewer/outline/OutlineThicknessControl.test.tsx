import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OutlineThicknessControl } from "./OutlineThicknessControl";

it("reports width during drag, resets to zero, and does not start a parent viewer gesture", () => {
  const change = vi.fn(),
    gesture = vi.fn();
  render(
    <div onPointerDown={gesture}>
      <OutlineThicknessControl value={1.2} onChange={change} />
    </div>,
  );
  const slider = screen.getByRole("slider", { name: "외곽선 두께" });
  fireEvent.pointerDown(slider);
  expect(gesture).not.toHaveBeenCalled();
  fireEvent.change(slider, { target: { value: "1.75" } });
  expect(change).toHaveBeenLastCalledWith(1.75);
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  expect(change).toHaveBeenLastCalledWith(0);
});
