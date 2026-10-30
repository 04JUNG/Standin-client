import { useExportStore } from "../store/exportStore";
import type { QueryClient } from "@tanstack/react-query";
import { forgetFramedJob } from "./framedExport";
/** Preferences and explicit picks invalidate final receipts, never analysis or candidate identity. */
export function invalidateFinalReview(client: QueryClient, job: string) {
  forgetFramedJob(job);
  useExportStore.setState({
    partialConsentBinding: undefined,
    individualConsentBinding: undefined,
  });
  const filters = {
    predicate: (q: import("@tanstack/react-query").Query) => {
      const key = q.queryKey;
      if (key[0] === "prepared-scene" && key[2] === job) return true;
      if (key[0] === "body" && key[2] === job && key[4] === "review") return true;
      if (
        !["framed-preview", "framed-image"].includes(String(key[0])) ||
        typeof key[2] !== "string"
      )
        return false;
      try {
        return new URL(key[2], "https://standin.invalid").searchParams.get("jobId") === job;
      } catch {
        return false;
      }
    },
  };
  void client.cancelQueries(filters);
  client.removeQueries(filters);
}
