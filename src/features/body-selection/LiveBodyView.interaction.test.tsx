import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveBodyView } from "./LiveBodyView";
import type { BodyLook } from "./contract";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  rotation: vi.fn(),
  dispose: vi.fn(),
  lost: () => {},
  runtime: { data: {} as object | undefined, isPending: false },
}));
vi.mock("./shapeRuntime/load", () => ({
  supportedRuntime: (ref: unknown) => !!ref,
  useShapeRuntime: () => mocks.runtime,
}));
vi.mock("./shapeRuntime/evaluate", () => ({
  resolveControls: (_: unknown, __: unknown, c: unknown) => c,
}));
vi.mock("./shapeRuntime/mountShapeBody", () => ({
  mountShapeBody: (_canvas: unknown, _runtime: unknown, lost: () => void) => {
    mocks.lost = lost;
    return {
      update: mocks.update,
      setRotation: mocks.rotation,
      dispose: mocks.dispose,
    };
  },
}));
const look = { characterId: "base", shape: {}, shapeRuntime: { preset: "BASE" } } as BodyLook;
function content(interactive = true, height = 180, option = look) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <LiveBodyView
        option={option}
        name="내 카드"
        controls={{ height }}
        edited
        personIndex={0}
        variant="app"
        interactive={interactive}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.runtime = { data: {}, isPending: false };
});
describe("create/edit preview opt-in", () => {
  it("keeps candidate previews passive by default", () => {
    render(content(false));
    expect(screen.queryByLabelText("체형 크게 보기")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });
  it("shares rotation and current values with enlargement, and restores focus on Escape", () => {
    const { rerender } = render(content());
    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" });
    expect(mocks.rotation).toHaveBeenLastCalledWith(Math.PI / 12);
    const open = screen.getByLabelText("체형 크게 보기");
    open.focus();
    fireEvent.click(open);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.rotation).toHaveBeenLastCalledWith(Math.PI / 12);
    rerender(content(true, 190));
    expect(mocks.update).toHaveBeenLastCalledWith({ height: 190 }, "BASE");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
  it("shows loading and failure in the enlarged preview", () => {
    mocks.runtime = { data: undefined, isPending: true };
    const { rerender } = render(content());
    fireEvent.click(screen.getByLabelText("체형 크게 보기"));
    expect(screen.getAllByText("3D 체형 불러오는 중")).toHaveLength(2);
    mocks.runtime = { data: undefined, isPending: false };
    rerender(content());
    expect(screen.getAllByText(/회전 미리보기를 사용할 수 없어/)).toHaveLength(2);
  });
  it("falls back on context loss and recovers for a new runtime", () => {
    const { rerender } = render(content());
    act(() => mocks.lost());
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText(/회전 미리보기를 사용할 수 없어/)).toBeTruthy();
    mocks.runtime = { data: {}, isPending: false };
    rerender(content());
    expect(screen.getByRole("group")).toBeTruthy();
  });
  it("supports a full turn, releases pointer capture and keeps rotation when controls change", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const { rerender } = render(content());
    const target = screen.getByRole("group");
    Object.defineProperty(target, "clientWidth", { value: 200 });
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(target, { button: 0, clientX: 0 });
    fireEvent.pointerMove(target, { clientX: 200 });
    expect(mocks.rotation).toHaveBeenLastCalledWith(Math.PI * 2);
    fireEvent.pointerUp(target);
    expect(target.releasePointerCapture).toHaveBeenCalled();
    rerender(content(true, 192));
    expect(mocks.update).toHaveBeenLastCalledWith({ height: 192 }, "BASE");
    expect(mocks.rotation).toHaveBeenLastCalledWith(Math.PI * 2);
    fireEvent.pointerMove(target, { clientX: 300 });
    expect(mocks.rotation).toHaveBeenLastCalledWith(Math.PI * 2);
    vi.unstubAllGlobals();
  });
  it("cleans up a failed context and can load a replacement asset", () => {
    const { container, rerender } = render(content());
    // A catalog runtime replacement must dispose the previous canvas.
    mocks.runtime = { data: {}, isPending: false };
    rerender(content(true, 185, { ...look, characterId: "other" }));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenLastCalledWith({ height: 185 }, "BASE");
  });
});
