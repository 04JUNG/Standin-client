import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import type { CandidateIdentity } from "./contract";
import {
  preparationHttp,
  waitForPoll,
  type PreparationTransport,
  type PreparationSnapshot,
} from "./http";

/** One bounded batch per owner/job; remounting a surface is never cancellation. */
export class PreparationSession {
  private value: PreparationSnapshot = { binding: "", status: "idle" };
  private controller?: AbortController;
  private expiry?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private identities: CandidateIdentity[] = [];
  private listeners = new Set<() => void>();
  constructor(
    readonly job: string,
    private transport: PreparationTransport = preparationHttp,
  ) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: PreparationSnapshot) {
    this.value = next;
    this.listeners.forEach((listener) => listener());
  }
  activate(binding: string, identities: CandidateIdentity[]) {
    if (this.value.binding === binding && this.value.status !== "idle") return;
    this.cancel();
    this.identities = identities;
    this.start(binding);
  }
  retry() {
    if (["failed", "cancelled", "ready"].includes(this.value.status)) {
      this.cancel();
      this.start(this.value.binding);
    }
  }
  private start(binding: string) {
    const controller = new AbortController();
    this.controller = controller;
    this.update({ binding, status: "preparing" });
    const deadline = setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      125_000,
    );
    void (async () => {
      try {
        let batch = await this.transport.prepare(
          this.job,
          crypto.randomUUID(),
          this.revision,
          this.identities,
          controller.signal,
        );
        const batchId = batch.batchId,
          contextHash = batch.contextHash;
        for (;;) {
          if (controller.signal.aborted || this.controller !== controller) {
            // A lost POST response may have created a server batch after cancellation.
            void this.transport.cancel(this.job, batch.batchId).catch(() => {});
            return;
          }
          if (
            batch.batchId !== batchId ||
            batch.contextHash !== contextHash ||
            (this.value.batch && batch.eventSequence < this.value.batch.eventSequence)
          )
            throw new Error("stale preparation");
          this.revision = batch.revision;
          if (Date.parse(batch.expiresAt) <= Date.now()) throw new Error("expired preparation");
          this.update({ binding, status: batch.top5Ready ? "ready" : "preparing", batch });
          if (batch.top5Ready) {
            this.expiry = setTimeout(
              () => {
                if (this.controller === controller) this.update({ binding, status: "failed" });
              },
              Math.max(1, Date.parse(batch.expiresAt) - Date.now()),
            );
            return;
          }
          if (["invalidated", "cancelled"].includes(batch.status))
            throw new Error("invalid preparation");
          await waitForPoll(controller.signal);
          batch = await this.transport.status(
            this.job,
            batchId,
            this.identities,
            controller.signal,
          );
        }
      } catch {
        if (this.controller === controller) {
          const batch = this.value.batch;
          if (batch) void this.transport.cancel(this.job, batch.batchId).catch(() => {});
          this.update({ binding, status: "failed" });
        }
      } finally {
        clearTimeout(deadline);
      }
    })();
  }
  cancel() {
    clearTimeout(this.expiry);
    this.controller?.abort();
    this.controller = undefined;
    const batch = this.value.batch;
    if (batch && this.value.status === "preparing")
      void this.transport.cancel(this.job, batch.batchId).catch(() => {});
    if (this.value.binding) this.update({ binding: this.value.binding, status: "cancelled" });
  }
}
const sessions = new Map<string, PreparationSession>();
export function preparationSession(owner: string, job: string) {
  const key = JSON.stringify([owner, job]);
  let session = sessions.get(key);
  if (!session) {
    while (sessions.size >= 3) {
      const first = sessions.keys().next().value!;
      sessions.get(first)!.cancel();
      sessions.delete(first);
    }
    session = new PreparationSession(job);
    sessions.set(key, session);
  }
  return session;
}
useInstallationStore.subscribe((next, previous) => {
  if (next.credentials?.installationId === previous.credentials?.installationId) return;
  for (const session of sessions.values()) session.cancel();
  sessions.clear();
});
usePoseSelectionStore.subscribe((next, previous) => {
  if (next.jobId === previous.jobId) return;
  for (const session of sessions.values())
    if (
      session.job !== next.serverJobId &&
      session.job !== next.jobId &&
      session.snapshot().status === "preparing"
    )
      session.cancel();
});
