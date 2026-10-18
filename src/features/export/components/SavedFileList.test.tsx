import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SavedFileList } from "./SavedFileList";
const startFileDrag = vi.hoisted(() => vi.fn());
vi.mock("../api/drag.service", () => ({ dragService: { isSupported: true, startFileDrag } }));
beforeEach(() => {
  startFileDrag.mockReset();
  startFileDrag.mockResolvedValue(undefined);
});

it.each([false, true])(
  "dense=%s: saved FBX starts native file drag and reports drop completion",
  async (dense) => {
    const path = "/tmp/standin-result.fbx";
    render(<SavedFileList paths={[path]} onCopy={vi.fn()} dense={dense} />);
    const row = screen.getByRole("listitem");
    expect(row).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(row);
    expect(startFileDrag).toHaveBeenCalledWith([path], expect.any(Function));
    act(() => startFileDrag.mock.calls[0]![1]("dropped"));
    expect(screen.getByText("반영됐는지 확인해 주세요")).toBeTruthy();
  },
);

it("offers folder fallback when native drag fails", async () => {
  startFileDrag.mockRejectedValue(new Error("native failure"));
  render(<SavedFileList paths={["/tmp/result.bvh"]} onCopy={vi.fn()} />);
  fireEvent.dragStart(screen.getByRole("listitem"));
  expect(await screen.findByRole("alert")).toHaveTextContent("폴더를 열어");
});
