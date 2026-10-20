import { expect, it, vi } from "vitest";
import { PreviewRequestQueue } from "./requestQueue";
it("serializes optional PNG/GLB work and removes aborted queued work before transport", async () => {
  const queue = new PreviewRequestQueue();
  let release!: () => void;
  const active = queue.run(
    new AbortController().signal,
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  await Promise.resolve();
  const cancelled = new AbortController();
  const neverTransport = vi.fn();
  const blocked = queue.run(cancelled.signal, neverTransport).catch((error) => error);
  const nextTransport = vi.fn(async () => "png");
  const next = queue.run(new AbortController().signal, nextTransport);
  cancelled.abort();
  expect(await blocked).toBe(cancelled.signal.reason);
  expect(neverTransport).not.toHaveBeenCalled();
  expect(nextTransport).not.toHaveBeenCalled();
  release();
  await active;
  expect(await next).toBe("png");
  expect(nextTransport).toHaveBeenCalledOnce();
  expect(await queue.run(new AbortController().signal, async () => "glb")).toBe("glb");
});
