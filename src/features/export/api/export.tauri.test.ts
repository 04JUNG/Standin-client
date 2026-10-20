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
