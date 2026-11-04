import { Blob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { queueRepresentativeFrame } from "./history";
import { captureView } from "./renderer";
import type { InteractiveController, InteractiveSnapshot } from "./controller";
import type { SearchCamera } from "./contract";
vi.mock("./renderer", () => ({
  captureView: vi.fn(),
  observationForView: vi.fn(() => ({ yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 })),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function fakeController() {
  let value = {
    binding: "selection",
    previewState: "authoritative",
    exportState: "ready",
    operation: { revision: 1, stateHash: "a".repeat(64) },
    model: { packet: { stateHash: "a".repeat(64) } },
  } as InteractiveSnapshot;
  let listener = () => {};
  const controller = {
    snapshot: () => value,
    subscribe: (fn: () => void) => {
      listener = fn;
      return () => {};
    },
  } as InteractiveController;
  return {
    controller,
    change() {
      value = { ...value, binding: "new", exportState: "superseded" };
      listener();
    },
  };
}
it("does not upload an old frame after a newer hand/refine revision and never changes file readiness", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", webcrypto);
  const c = fakeController();
  const upload = vi.fn();
  let finish!: (b: Blob) => void;
  vi.mocked(captureView).mockImplementation(
    () =>
      new Promise((r) => {
        finish = r as (b: Blob) => void;
      }),
  );
  queueRepresentativeFrame(c.controller, document.createElement("div"), {} as SearchCamera, upload);
  await vi.advanceTimersByTimeAsync(0);
  c.change();
  finish(new Blob(["png"]));
  await vi.advanceTimersByTimeAsync(0);
  expect(upload).not.toHaveBeenCalled();
  expect(c.controller.snapshot().exportState).toBe("superseded");
});
it("a GPU/capture failure does not revoke an already verified ready file", async () => {
  vi.useFakeTimers();
  const c = fakeController(),
    upload = vi.fn();
  vi.mocked(captureView).mockRejectedValue(Error("context lost"));
  queueRepresentativeFrame(c.controller, document.createElement("div"), {} as SearchCamera, upload);
  await vi.advanceTimersByTimeAsync(0);
  expect(c.controller.snapshot().exportState).toBe("ready");
  expect(upload).not.toHaveBeenCalled();
});
