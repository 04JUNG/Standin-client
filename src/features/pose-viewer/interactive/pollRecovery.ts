import { ApiError } from "@/shared/api/errors";

const timeout = () => new ApiError(504, "INTERACTIVE_POLL_TIMEOUT", "");
export function transientPollError(error: unknown) {
  if (error instanceof ApiError)
    return [429, 502, 503, 504].includes(error.status) &&
      !/DISABLED|NOT_CSP_CERTIFIED|INTEGRITY|BINDING_MISMATCH/.test(error.code);
  return !!error && typeof error === "object" && "kind" in error && error.kind === "network";
}

/** Retry only a read of the accepted operation. Never resubmit preparation here. */
export async function pollWithRecovery<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  deadline: number,
): Promise<T> {
  const until = Math.min(deadline, Date.now() + 120_000);
  let failures = 0;
  for (;;) {
    signal.throwIfAborted();
    if (Date.now() >= until) throw timeout();
    const attempt = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => attempt.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    try {
      // Race as well as abort: a stalled transport must not leave the UI spinning.
      return await Promise.race([
        read(attempt.signal),
        new Promise<never>((_, reject) => {
          attempt.signal.addEventListener("abort", () => reject(attempt.signal.reason), { once: true });
          timer = setTimeout(() => attempt.abort(timeout()), Math.min(15_000, until - Date.now()));
        }),
      ]);
    } catch (error) {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      signal.throwIfAborted();
      const failure = attempt.signal.aborted ? attempt.signal.reason : error;
      if (!transientPollError(failure)) throw failure;
      const remaining = until - Date.now();
      if (remaining <= 0) throw timeout();
      const retryAfter = failure instanceof ApiError ? (failure.retryAfterSeconds ?? 0) * 1000 : 0;
      const backoff = Math.min(8_000, 1_000 * 2 ** Math.min(failures++, 3));
      const delay = Math.min(remaining, Math.max(retryAfter, backoff * (0.8 + Math.random() * 0.4)));
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(waiting); reject(signal.reason); };
        const waiting = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, delay);
        signal.addEventListener("abort", cancel, { once: true });
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
}
