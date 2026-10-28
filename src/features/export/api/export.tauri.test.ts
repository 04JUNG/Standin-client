import { afterEach, expect, it, vi } from "vitest";
import { exportTauri } from "./export.tauri";
import { globalShortcutTauri } from "@/features/capture/api/globalShortcut.tauri";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => native);
afterEach(() => vi.clearAllMocks());
it.each(["CANCELLED", "INVALID_FOLDER", "WRITE_FAILED", "UNSUPPORTED"])(
  "%s keeps the export error code but replaces native details with usable instructions",
  async (code) => {
    native.invoke.mockRejectedValueOnce({ code, message: "OS error /private/internal/path" });
    const error = await exportTauri.chooseFolder().catch((e) => e);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[가-힣]/);
    expect(error.message).not.toMatch(/OS error|private|internal/);
  },
);
it.each(["INVALID_ACCELERATOR", "REGISTER_FAILED", "UNREGISTER_FAILED", "UNSUPPORTED"])(
  "%s hides raw native shortcut details without changing the error code",
  async (code) => {
    native.invoke.mockRejectedValueOnce({ code, message: "Invalid accelerator at /internal/path" });
    const error = await globalShortcutTauri.register("Ctrl+K").catch((e) => e);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[가-힣]/);
    expect(error.message).not.toMatch(/Invalid accelerator|internal/);
  },
);
it("passes a validated scene companion with the same native FBX write without adding it to drag paths", async () => {
  const sceneMetadata = JSON.stringify({
    version: "csp-scene-manifest-v1",
    artifact: { sha256: "a".repeat(64) },
  });
  native.invoke.mockResolvedValueOnce({ path: "/fixture/scene (1).fbx" });
  const saved = await exportTauri.saveCandidates({
    folder: "/fixture",
    files: [{ fileName: "scene.fbx", content: new Uint8Array([1, 2]), sceneMetadata }],
  });
  expect(native.invoke).toHaveBeenCalledWith("save_pose_file", {
    folder: "/fixture",
    fileName: "scene.fbx",
    contentBase64: "AQI=",
    sceneMetadata,
  });
  expect(saved).toEqual([{ path: "/fixture/scene (1).fbx" }]);
});
