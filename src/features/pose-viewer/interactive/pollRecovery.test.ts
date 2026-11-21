import { afterEach, expect, it, vi } from "vitest";
import { ApiError, networkError } from "@/shared/api/errors";
import { pollWithRecovery } from "./pollRecovery";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each([429, 502, 503, 504, "network"])("recovers %s with the same read", async (status) => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValueOnce(status === "network" ? networkError() : new ApiError(Number(status), "UNAVAILABLE", ""))
    .mockResolvedValue("ready");
  const result = pollWithRecovery(read, new AbortController().signal, Date.now() + 300_000);
  await vi.advanceTimersByTimeAsync(1_201);
  expect(await result).toBe("ready");
  expect(read).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 409, 410])("does not retry terminal status %s", async (status) => {
  const error = new ApiError(status, "FAILED", "");
  const read = vi.fn().mockRejectedValue(error);
  await expect(pollWithRecovery(read, new AbortController().signal, Date.now() + 300_000)).rejects.toBe(error);
  expect(read).toHaveBeenCalledOnce();
});
it("honors Retry-After and stops immediately on cancellation during backoff", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValue(new ApiError(503, "UNAVAILABLE", "", undefined, undefined, 20));
  const controller = new AbortController();
  const result = pollWithRecovery(read, controller.signal, Date.now() + 300_000);
  const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(19_000);
  expect(read).toHaveBeenCalledOnce();
  controller.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(read).toHaveBeenCalledOnce();
});
it("bounds a prolonged outage and hanging reads even when the transport ignores abort", async () => {
  vi.useFakeTimers();
  const read = vi.fn(() => new Promise<never>(() => {}));
  const result = pollWithRecovery(read, new AbortController().signal, Date.now() + 300_000);
  const assertion = expect(result).rejects.toMatchObject({ code: "INTERACTIVE_POLL_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(120_001);
  await assertion;
  expect(read.mock.calls.length).toBeGreaterThan(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not wait beyond operation expiry or the total polling deadline", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValue(new ApiError(503, "UNAVAILABLE", ""));
  const result = pollWithRecovery(read, new AbortController().signal, Date.now() + 500);
  const assertion = expect(result).rejects.toMatchObject({ code: "INTERACTIVE_POLL_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(501);
  await assertion;
  expect(read).toHaveBeenCalledOnce();
});
