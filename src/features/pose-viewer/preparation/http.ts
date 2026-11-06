import { apiFetch } from "@/shared/api/client";
import { VERSION, readBatch, type CandidateIdentity, type PreparedBatch } from "./contract";
export const preparationPath = (job: string, batch?: string) =>
  `/v1/analysis/jobs/${encodeURIComponent(job)}/candidate-preparation${batch ? `/${encodeURIComponent(batch)}` : ""}`;
export const preparationHttp = {
  async prepare(
    job: string,
    mutationId: string,
    expectedRevision: number,
    identities: CandidateIdentity[],
    signal: AbortSignal,
  ) {
    return readBatch(
      await apiFetch<unknown>(preparationPath(job), {
        method: "POST",
        body: { schemaVersion: VERSION, mutationId, expectedRevision },
        auth: false,
        signal,
      }),
      identities,
    );
  },
  async status(job: string, batch: string, identities: CandidateIdentity[], signal: AbortSignal) {
    return readBatch(
      await apiFetch<unknown>(preparationPath(job, batch), {
        auth: false,
        cache: "no-store",
        signal,
      }),
      identities,
    );
  },
  async cancel(job: string, batch: string) {
    await apiFetch<unknown>(preparationPath(job, batch), { method: "DELETE", auth: false });
  },
};
export type PreparationTransport = typeof preparationHttp;
export function waitForPoll(signal: AbortSignal, ms = 1000): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export type PreparationSnapshot = {
  binding: string;
  status: "idle" | "preparing" | "ready" | "failed" | "cancelled";
  batch?: PreparedBatch;
};
