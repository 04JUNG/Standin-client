import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShapeSlider } from "./ShapeControls";
it("commits one adjustment per interaction, never on render or each slider change", () => {
  const onCommit = vi.fn(),
    onChange = vi.fn();
  render(
    <ShapeSlider
      control={{ key: "height", label: "키", min: 100, max: 200, step: 1, default: 170 }}
      value={170}
      id="height-test"
      onChange={onChange}
      onCommit={onCommit}
    />,
  );
  const slider = screen.getByRole("slider");
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.change(slider, { target: { value: 175 } });
  fireEvent.change(slider, { target: { value: 180 } });
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  fireEvent.blur(slider);
  expect(onCommit).toHaveBeenCalledTimes(1);
  fireEvent.change(slider, { target: { value: 181 } });
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(onCommit).toHaveBeenCalledTimes(2);
});
