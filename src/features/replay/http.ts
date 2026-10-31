import { apiFetch } from "@/shared/api/client";
type Options = NonNullable<Parameters<typeof apiFetch>[1]>;
/** Keep an offline/hung replay request from holding the queue or result-photo UI forever. */
export async function replayFetch<T>(path: string, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15_000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    return await apiFetch<T>(path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
