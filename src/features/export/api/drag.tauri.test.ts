import { expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn(async () => "/tmp/drag-preview.png"));
const startDrag = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@crabnebula/tauri-plugin-drag", () => ({ startDrag }));
import { dragTauri } from "./drag.tauri";
it("passes saved file paths to the OS as copies and forwards drop/cancel outcomes", async () => {
  const onEnd = vi.fn();
  await dragTauri.startFileDrag(["/tmp/pose.fbx"], onEnd);
  expect(invoke).toHaveBeenCalledWith("drag_icon_path");
  expect(startDrag).toHaveBeenCalledWith(
    { item: ["/tmp/pose.fbx"], icon: "/tmp/drag-preview.png", mode: "copy" },
    expect.any(Function),
  );
  const callback = (
    startDrag.mock.calls[0] as unknown as [unknown, (v: { result: string }) => void]
  )[1];
  callback({ result: "Dropped" });
  callback({ result: "Cancelled" });
  expect(onEnd.mock.calls).toEqual([["dropped"], ["cancelled"]]);
});
