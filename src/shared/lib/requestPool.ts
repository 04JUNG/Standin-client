/** Abortable FIFO: queued work never starts after its observer/search was cancelled. */
export function createRequestPool(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        const i = queue.indexOf(start);
        if (i >= 0) queue.splice(i, 1);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        active++;
        resolve();
      };
      if (active < limit) start();
      else {
        queue.push(start);
        signal.addEventListener("abort", abort, { once: true });
      }
    });
    try {
      signal.throwIfAborted();
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
export const runPosterRequest = createRequestPool(6);
