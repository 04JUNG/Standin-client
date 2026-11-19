import { ApiError } from "@/shared/api/errors";

type Request = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  signal?: AbortSignal;
  onProgress?: (phase: "refining" | "preparing") => void;
};
/** One response stream is one selected request. Old BFF JSON never implies execution. */
export async function readSelectedRefineResponse<T>(
  response: Response,
  request: Request,
): Promise<T> {
  if (!response.headers.get("Content-Type")?.includes("application/x-ndjson"))
    return response.json() as Promise<T>;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing refine stream");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      request.signal?.throwIfAborted();
      const { value, done } = await reader.read();
      request.signal?.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1_000_000) throw new Error("Refine stream exceeds limit");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = JSON.parse(line);
        if (event.type === "progress") {
          if (
            event.jobId !== request.jobId ||
            event.personIndex !== request.personIndex ||
            event.candidateId !== request.candidateId
          )
            throw new Error("Refine progress changed selection");
          if (event.phase === "refining" || event.phase === "preparing")
            request.onProgress?.(event.phase);
        } else if (event.type === "result") {
          if (!Number.isInteger(event.status) || event.status < 200 || event.status >= 300)
            throw new ApiError(
              event.status || 503,
              event.body?.error?.code || "REFINE_UNAVAILABLE",
              "",
            );
          return event.body as T;
        }
      }
      if (done) throw new Error("Refine stream ended without result");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
