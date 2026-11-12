import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OutlineControl } from "./OutlineControl";
import { usePoseSelectionStore as store } from "../store/poseSelectionStore";
beforeEach(() => store.getState().clearSelection());
afterEach(cleanup);
it("leaves native thumb dragging in charge and does not start the surrounding viewer gesture", () => {
  const viewer = vi.fn();
  render(
    <div onPointerDown={viewer}>
      <OutlineControl personIndex={0} />
    </div>,
  );
  const slider = screen.getByRole("slider");
  const capture = vi.fn();
  slider.setPointerCapture = capture;
  fireEvent.pointerDown(slider, { pointerId: 1 });
  expect(capture).not.toHaveBeenCalled();
  expect(viewer).not.toHaveBeenCalled();
  expect(store.getState().outlineEditingByPerson[0]).toBe(true);
  fireEvent.change(slider, { target: { value: "1.25" } });
  expect(store.getState().outlineByPerson[0]).toBe(1.25);
  fireEvent.pointerUp(slider);
  expect(store.getState().outlineEditingByPerson[0]).toBeUndefined();
});
it("ends editing on cancellation or unmount and retains supported line-style widths", () => {
  store.getState().setPersonSkin(0, "flesh-guide");
  const view = render(<OutlineControl personIndex={0} compact />);
  const slider = screen.getByRole("slider");
  expect(slider).toHaveAttribute("step", "2");
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: "2" } });
  fireEvent.pointerCancel(slider);
  expect(store.getState().outlineEditingByPerson[0]).toBeUndefined();
  fireEvent.pointerDown(slider);
  view.unmount();
  expect(store.getState().outlineEditingByPerson[0]).toBeUndefined();
  expect(store.getState().outlineByPerson[0]).toBe(2);
});
