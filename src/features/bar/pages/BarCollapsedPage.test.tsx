import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BarCollapsedPage } from "./BarCollapsedPage";

const service = vi.hoisted(() => ({
  control: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
}));
vi.mock("../api/windowMode.service", () => ({ windowModeService: service }));

function Route() {
  return <p data-testid="route">{useLocation().pathname}</p>;
}
function mount() {
  render(
    <MemoryRouter initialEntries={["/bar"]}>
      <BarCollapsedPage />
      <Route />
    </MemoryRouter>,
  );
  return screen.getByRole("button", { name: "Standin 열기" });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => vi.unstubAllGlobals());

it("opens the native close menu on right-click without expanding or dragging the bar", () => {
  const button = mount();
  fireEvent.pointerDown(button, { button: 2, clientX: 1, clientY: 1 });
  fireEvent.pointerMove(button, { button: 2, clientX: 20, clientY: 20 });
  expect(fireEvent.contextMenu(button)).toBe(false);
  expect(service.control).toHaveBeenCalledOnce();
  expect(service.control).toHaveBeenCalledWith("showBarMenu");
  expect(service.startDragging).not.toHaveBeenCalled();
  expect(screen.getByTestId("route")).toHaveTextContent("/bar");
});
it("macOS Control-click opens the context menu and does not expand the bar", () => {
  const button = mount();
  fireEvent.pointerDown(button, { button: 0, ctrlKey: true });
  fireEvent.contextMenu(button, { ctrlKey: true });
  fireEvent.click(button, { button: 0, ctrlKey: true });
  expect(service.control).toHaveBeenCalledOnce();
  expect(service.control).toHaveBeenCalledWith("showBarMenu");
  expect(screen.getByTestId("route")).toHaveTextContent(/^\/bar$/);
});
it.each([{ key: "ContextMenu" }, { key: "F10", shiftKey: true }])(
  "opens the close menu from the keyboard (%j)",
  (key) => {
    fireEvent.keyDown(mount(), key);
    expect(service.control).toHaveBeenCalledOnce();
    expect(service.control).toHaveBeenCalledWith("showBarMenu");
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/bar$/);
  },
);
it("still expands on left-click and suppresses the click after a drag", () => {
  const button = mount();
  fireEvent.pointerDown(button, { button: 0, clientX: 1, clientY: 1 });
  fireEvent.pointerMove(button, { button: 0, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(button);
  fireEvent.click(button);
  expect(service.startDragging).toHaveBeenCalledOnce();
  expect(screen.getByTestId("route")).toHaveTextContent(/^\/bar$/);
  fireEvent.click(button);
  expect(screen.getByTestId("route")).toHaveTextContent("/bar/actions");
  expect(service.control).not.toHaveBeenCalled();
});
