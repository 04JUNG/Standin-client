import { expect, it } from "vitest";
import { createRequestPool } from "./requestPool";
it("caps actual work, removes cancelled queued tasks and releases slots after failure", async () => {
  const run = createRequestPool(2),
    releases: (() => void)[] = [];
  let active = 0,
    peak = 0,
    calls = 0;
  const task = async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise<void>((r) => releases.push(r));
    active--;
  };
  const abort = new AbortController();
  const first = run(new AbortController().signal, task);
  const second = run(new AbortController().signal, task);
  const cancelled = run(abort.signal, task).catch((e) => e.name);
  const fourth = run(new AbortController().signal, task);
  await Promise.resolve();
  expect(calls).toBe(2);
  abort.abort();
  releases.shift()!();
  await first;
  expect(calls).toBe(3);
  expect(peak).toBe(2);
  releases.forEach((r) => r());
  await Promise.all([second, fourth]);
  expect(await cancelled).toBe("AbortError");
  await expect(
    run(new AbortController().signal, async () => {
      throw Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(await run(new AbortController().signal, async () => 42)).toBe(42);
});
