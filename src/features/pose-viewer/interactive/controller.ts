import { sameAppearance, type Appearance } from "../outline/appearance";
import { ApiError } from "@/shared/api/errors";
import type { SurfaceView } from "./InteractivePose";
import { measure } from "./metrics";
import { localHandSurface, solvedCamera, type LoadedVariants } from "./solved";
import {
  interactiveHttp,
  type Operation,
  type InteractiveTransport,
  type ModelResult,
  type Target,
  type Prepare,
} from "./http";
export type PreviewState = "loading" | "local-draft" | "solving" | "authoritative" | "error";
// Aggregate session budgets, not one full budget for every selected person.
const preparedAtlases = new Map<InteractiveController, LoadedVariants>();
const expiredError = (error: unknown) =>
  !!error && typeof error === "object" && "code" in error && error.code === "INTERACTIVE_EXPIRED";
export type ExportState =
  "not-requested" | "queued" | "building" | "validating" | "ready" | "failed" | "superseded";
export type InteractiveSnapshot = {
  appearanceAvailable?: boolean;
  binding?: string;
  previewState: PreviewState;
  exportState: ExportState;
  operation?: Operation;
  model?: ModelResult;
  modelError?: boolean;
  error?: boolean;
  failure?: unknown;
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
  private desired?: {
    binding: string;
    candidateId: string;
    ready: boolean;
    appearance?: Appearance;
  };
  private mutation?: Prepare;
  private handAtlas?: LoadedVariants;
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
  select(binding: string, candidateId: string, ready: boolean, appearance?: Appearance) {
    if (
      this.desired?.binding === binding &&
      this.desired.ready === ready &&
      sameAppearance(this.desired.appearance, appearance)
    )
      return;
    const changed = this.desired?.binding !== binding;
    this.desired = { binding, candidateId, ready, appearance };
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
      failure: undefined,
      modelError: false,
    });
    if (ready)
      this.timer = setTimeout(() => {
        void this.run(this.generation);
      }, this.debounceMs);
  }
  invalidate(preserveLocalHands = false) {
    if (!preserveLocalHands) {
      this.clearDraft();
      this.releaseHandAtlas();
    }
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
  installHandAtlas(atlas: LoadedVariants) {
    this.clearDraft();
    this.releaseHandAtlas();
    const total = (field: "bytes" | "gpuBytes") =>
      [...preparedAtlases.values()].reduce((sum, a) => sum + a[field], 0) + atlas[field];
    while (
      preparedAtlases.size >= 3 ||
      total("bytes") > 64 * 1024 * 1024 ||
      total("gpuBytes") > 64 * 1024 * 1024
    ) {
      const oldest = preparedAtlases.keys().next().value;
      if (!oldest) {
        atlas.release();
        return;
      }
      oldest.clearDraft();
      oldest.releaseHandAtlas();
    }
    this.handAtlas = atlas;
    preparedAtlases.set(this, atlas);
  }
  private releaseHandAtlas() {
    preparedAtlases.delete(this);
    this.handAtlas?.release();
    this.handAtlas = undefined;
  }
  private expire() {
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.recovered = false;
    this.mutation = undefined;
    this.clearDraft();
    this.releaseHandAtlas();
    this.publish({
      previewState: "error",
      exportState: "failed",
      operation: undefined,
      error: true,
    });
  }
  applyHands(left: string | null, right: string | null) {
    const started = performance.now();
    const model = this.value.model;
    if (!model?.frame || !this.handAtlas) return false;
    try {
      const surface = localHandSurface(this.handAtlas, model.state.identity, left, right);
      if (!surface) return false;
      this.localDraft({
        body: surface.body,
        camera: solvedCamera(model.state, model.frame),
        onFirstFrame: () => measure("hand-frame", started),
      });
      return true;
    } catch {
      return false;
    }
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
      !sameAppearance(op.appearance, previous.appearance) ||
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
        const recovery = await this.transport.head(
          this.target,
          desired.candidateId,
          signal,
          desired.appearance,
        );
        if (generation !== this.generation) return;
        this.fence = { revision: recovery.currentRevision, stateHash: recovery.currentStateHash };
        this.head = recovery.operation ?? undefined;
        this.publish({ appearanceAvailable: recovery.appearanceExport?.available === true });
        resumed = recovery.operation;
        if (resumed && !sameAppearance(resumed.appearance, desired.appearance)) resumed = null;
        this.recovered = true;
      }
      if (desired.appearance && this.value.appearanceAvailable !== true)
        throw new ApiError(503, "OUTLINE_DISABLED", "");
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
            ...(desired.appearance ? { appearance: desired.appearance } : {}),
          };
        const request = this.mutation;
        const creating = this.transport.prepare(this.target, request).then((next) => {
          if (
            next.revision !== request.revision ||
            next.candidateId !== request.candidateId ||
            !sameAppearance(next.appearance, request.appearance)
          )
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
          failure: op.errorCode ? new ApiError(409, op.errorCode, "") : undefined,
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
            .catch((error) => {
              if (!signal.aborted && generation === this.generation) {
                if (expiredError(error)) this.expire();
                else this.publish({ modelError: true });
              }
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
          if (this.transport.variants) {
            const immutable = op;
            void this.transport
              .variants(this.target, immutable, signal)
              .then((atlas) => {
                if (
                  generation !== this.generation ||
                  signal.aborted ||
                  this.value.operation?.stateHash !== immutable.stateHash ||
                  Date.parse(immutable.expiresAt) <= Date.now()
                ) {
                  atlas.release();
                  return;
                }
                this.installHandAtlas(atlas);
              })
              .catch(() => {
                /* Uncached hands keep the authoritative surface. */
              });
          }
          measure("file-ready", inputAt);
          const expiresIn = Date.parse(op.expiresAt) - Date.now();
          this.expiry = setTimeout(
            () => {
              if (generation === this.generation) {
                this.releaseHandAtlas();
                this.publish({ exportState: "superseded", operation: undefined });
              }
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
        [
          "REVISION_CONFLICT",
          "INTERACTIVE_SUPERSEDED",
          "INTERACTIVE_EXPIRED",
          "OUTLINE_DISABLED",
          "OUTLINE_NOT_CSP_CERTIFIED",
          "OUTLINE_UNAVAILABLE",
        ].includes(String(error.code))
      ) {
        this.recovered = false;
        this.mutation = undefined;
      }
      this.publish({ error: true, failure: error, exportState: "failed" });
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
    let result: Awaited<ReturnType<InteractiveTransport["file"]>>;
    try {
      result = await this.transport.file(this.target, operation, signal);
    } catch (error) {
      if (generation === this.generation && expiredError(error)) this.expire();
      throw error;
    }
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
