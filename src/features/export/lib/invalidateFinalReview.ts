import type { QueryClient } from "@tanstack/react-query";
import { forgetFramedJob } from "./framedExport";
/** Preferences and explicit picks invalidate final receipts, never analysis or candidate identity. */
export function invalidateFinalReview(client: QueryClient, job: string) {
  forgetFramedJob(job);
  client.removeQueries({
    predicate: (q) => {
      const key = q.queryKey;
      if (key[0] === "body" && key[2] === job && key[4] === "review") return true;
      if (key[0] !== "framed-preview" || typeof key[2] !== "string") return false;
      try {
        return new URL(key[2], "https://standin.invalid").searchParams.get("jobId") === job;
      } catch {
        return false;
      }
    },
  });
}
