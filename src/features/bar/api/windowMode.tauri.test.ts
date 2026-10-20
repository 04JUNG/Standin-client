import { beforeEach, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const { windowModeTauri } = await import("./windowMode.tauri");
beforeEach(() => invoke.mockClear());

it("passes the optional monitor fraction through both resize and saved-position commands", async () => {
  const size = { width: 720, height: 560, maxWidthFraction: 0.49 };
  await windowModeTauri.setMode("bar", size);
  expect(invoke).toHaveBeenLastCalledWith("set_window_mode", {
    req: { mode: "bar", ...size, monitor: undefined },
  });
  await windowModeTauri.setPosition({ x: 100, y: 200 }, size);
  expect(invoke).toHaveBeenLastCalledWith("set_window_position", { x: 100, y: 200, ...size });
});

it("leaves existing rough bar requests unrestricted", async () => {
  await windowModeTauri.setMode("bar", { width: 720, height: 560 });
  expect(invoke.mock.lastCall?.[1].req.maxWidthFraction).toBeUndefined();
  await windowModeTauri.setPosition({ x: 100, y: 200 }, { width: 720, height: 560 });
  expect(invoke.mock.lastCall?.[1].maxWidthFraction).toBeUndefined();
});
