import type { SurfaceView } from "./InteractivePose";
import { measure } from "./metrics";
import {
  interactiveHttp,
  type Operation,
  type InteractiveTransport,
  type ModelResult,
  type Target,
  type Prepare,
} from "./http";
export type PreviewState = "loading" | "local-draft" | "solving" | "authoritative" | "error";
export type ExportState =
  "not-requested" | "queued" | "building" | "validating" | "ready" | "failed" | "superseded";
export type InteractiveSnapshot = {
  binding?: string;
  previewState: PreviewState;
  exportState: ExportState;
  operation?: Operation;
  model?: ModelResult;
  modelError?: boolean;
  error?: boolean;
  localSurface?: SurfaceView;
};
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
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
/** One durable client coordinator per owner/job/person, retained across main↔bar remounts. */
export class InteractiveController {
  private value: InteractiveSnapshot = { previewState: "loading", exportState: "not-requested" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private head?: Operation;
  private recovered = false;
  private fence = { revision: 0, stateHash: null as string | null };
  private creating: Promise<Operation> | undefined;
  private desired?: { binding: string; candidateId: string; ready: boolean };
  private mutation?: Prepare;
  constructor(
    readonly target: Target,
    private readonly transport: InteractiveTransport = interactiveHttp,
    private readonly debounceMs = 250,
    private readonly pollingMs = 1000,
  ) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<InteractiveSnapshot>) {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  select(binding: string, candidateId: string, ready: boolean) {
    if (this.desired?.binding === binding && this.desired.ready === ready) return;
    const changed = this.desired?.binding !== binding;
    this.desired = { binding, candidateId, ready };
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    if (changed) this.mutation = undefined;
    this.publish({
      binding,
      previewState: "solving",
      exportState: "superseded",
      operation: undefined,
      error: false,
      modelError: false,
    });
    if (ready)
      this.timer = setTimeout(() => {
        void this.run(this.generation);
      }, this.debounceMs);
  }
  invalidate() {
    this.generation++;
    this.desired = undefined;
    this.mutation = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.controller?.abort();
    this.publish({
      binding: undefined,
      exportState: "superseded",
      previewState: "solving",
      operation: undefined,
    });
    // Best effort cancellation, while local readiness is already synchronously revoked.
    if (this.head) void this.transport.cancel(this.target, this.head).catch(() => undefined);
  }
  localDraft(surface: SurfaceView) {
    this.publish({ localSurface: surface, previewState: "local-draft", exportState: "superseded" });
  }
  clearDraft() {
    if (this.value.localSurface) this.publish({ localSurface: undefined });
  }
  dispose() {
    this.invalidate();
    this.publish({ model: undefined, localSurface: undefined });
  }
  private accept(op: Operation, previous: Operation, generation: number) {
    if (
      generation !== this.generation ||
      op.operationId !== previous.operationId ||
      op.candidateId !== previous.candidateId ||
      op.revision !== previous.revision ||
      op.selectionHash !== previous.selectionHash ||
      op.eventSequence < previous.eventSequence ||
      (previous.stateHash !== null && op.stateHash !== previous.stateHash)
    )
      return false;
    if (Date.parse(op.expiresAt) <= Date.now()) return false;
    return true;
  }
  private async run(generation: number) {
    const desired = this.desired;
    if (!desired?.ready || generation !== this.generation) return;
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    try {
      // Serialize creates so a late create is learned and cancelled before the next CAS.
      if (this.creating) {
        try {
          await this.creating;
        } catch {
          /* identical retry remains idempotent */
        }
      }
      if (generation !== this.generation) return;
      let resumed: Operation | null = null;
      if (!this.recovered) {
        const recovery = await this.transport.head(this.target, desired.candidateId, signal);
        if (generation !== this.generation) return;
        this.fence = { revision: recovery.currentRevision, stateHash: recovery.currentStateHash };
        this.head = recovery.operation ?? undefined;
        resumed = recovery.operation;
        this.recovered = true;
      }
      let op: Operation;
      if (resumed) op = resumed;
      else {
        if (!this.mutation)
          this.mutation = {
            schemaVersion: "standin.interactive-http.v1",
            candidateId: desired.candidateId,
            expectedRevision: this.head?.revision ?? this.fence.revision,
            expectedStateHash: this.head?.stateHash ?? this.fence.stateHash,
            revision: (this.head?.revision ?? this.fence.revision) + 1,
            mutationId: crypto.randomUUID(),
          };
        const request = this.mutation;
        const creating = this.transport.prepare(this.target, request).then((next) => {
          if (next.revision !== request.revision || next.candidateId !== request.candidateId)
            throw Error("prepare binding mismatch");
          this.head = next;
          this.fence = { revision: next.revision, stateHash: next.stateHash };
          return next;
        });
        this.creating = creating;
        try {
          op = await creating;
        } finally {
          if (this.creating === creating) this.creating = undefined;
        }
      }
      if (generation !== this.generation) {
        void this.transport.cancel(this.target, op).catch(() => undefined);
        return;
      }
      let requestedExport = false,
        requestedModel = false;
      const inputAt = performance.now();
      for (;;) {
        signal.throwIfAborted();
        if (generation !== this.generation) return;
        if (Date.parse(op.expiresAt) <= Date.now()) throw Error("expired operation");
        this.head = op;
        const inactive = ["superseded", "cancelled"].includes(op.previewState);
        this.publish({
          operation: op,
          previewState:
            op.previewState === "authoritative"
              ? "authoritative"
              : op.previewState === "solving"
                ? "solving"
                : "error",
          exportState: inactive
            ? "superseded"
            : op.exportState === "cancelled"
              ? "superseded"
              : op.exportState,
          error: inactive || op.previewState === "error",
        });
        if (inactive || op.previewState === "error") return;
        if (op.previewState === "authoritative" && op.stateHash && !requestedModel) {
          requestedModel = true;
          const immutable = op;
          void this.transport
            .model(this.target, immutable, desired.candidateId, signal)
            .then((model) => {
              if (
                generation !== this.generation ||
                this.value.operation?.stateHash !== immutable.stateHash
              )
                return;
              this.publish({ model, modelError: false, localSurface: undefined });
              measure("packet", inputAt);
            })
            .catch(() => {
              if (!signal.aborted && generation === this.generation)
                this.publish({ modelError: true });
            });
        }
        if (
          op.previewState === "authoritative" &&
          !requestedExport &&
          ["not-requested", "failed"].includes(op.exportState)
        ) {
          requestedExport = true;
          const next = await this.transport.export(this.target, op, signal);
          if (!this.accept(next, op, generation)) throw Error("stale export acknowledgement");
          op = next;
          continue;
        }
        if (op.exportState === "ready") {
          measure("file-ready", inputAt);
          const expiresIn = Date.parse(op.expiresAt) - Date.now();
          this.expiry = setTimeout(
            () => {
              if (generation === this.generation)
                this.publish({ exportState: "superseded", operation: undefined });
            },
            Math.min(expiresIn, 2147483647),
          );
          return;
        }
        if (op.exportState === "failed") return;
        await wait(this.pollingMs, signal);
        const next = await this.transport.poll(this.target, op, signal);
        if (next.eventSequence < op.eventSequence) continue;
        if (!this.accept(next, op, generation)) throw Error("stale operation event");
        op = next;
      }
    } catch (error) {
      if (signal.aborted || generation !== this.generation) return;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["REVISION_CONFLICT", "INTERACTIVE_SUPERSEDED", "INTERACTIVE_EXPIRED"].includes(
          String(error.code),
        )
      ) {
        this.recovered = false;
        this.mutation = undefined;
      }
      this.publish({ error: true, exportState: "failed" });
      measure("error", performance.now());
    }
  }
  retry() {
    if (!this.desired?.ready) return;
    // Retrying an uncertain POST reuses its exact body/idempotency key.
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.publish({ error: false, modelError: false, exportState: "queued" });
    void this.run(this.generation);
  }
  ready(binding: string) {
    return (
      this.value.binding === binding &&
      this.value.exportState === "ready" &&
      !!this.value.operation?.stateHash &&
      Date.parse(this.value.operation.expiresAt) > Date.now()
    );
  }
  async download(binding: string, signal: AbortSignal) {
    if (!this.ready(binding)) throw Error("current file unavailable");
    const generation = this.generation,
      operation = this.value.operation!;
    const result = await this.transport.file(this.target, operation, signal);
    signal.throwIfAborted();
    if (
      generation !== this.generation ||
      !this.ready(binding) ||
      this.value.operation?.stateHash !== result.receipt.stateHash ||
      operation.revision !== result.receipt.revision ||
      operation.operationId !== result.receipt.operation
    )
      throw Error("file superseded");
    return result;
  }
}
