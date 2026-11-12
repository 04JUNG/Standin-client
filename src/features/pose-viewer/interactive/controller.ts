import type { SkinId } from "../skin/skinChoices";
import { sameSkin, type Skin } from "../skin/skin";
import { sameAppearance, type Appearance } from "../outline/appearance";
import { ApiError } from "@/shared/api/errors";
import { pollWithRecovery, transientPollError } from "./pollRecovery";
import type { SurfaceView } from "./InteractivePose";
import { measure } from "./metrics";
import { localHandSurface, solvedCamera, type LoadedVariants } from "./solved";
import { ENCODING as BINARY_STATE_ENCODING } from "./shared/interactive_pose_v2.mjs";
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
/**
 * A busy BFF or Converter answers one head/prepare/export request with 429/5xx or drops it.
 * That is not a failed selection: retry it a few times before asking the user. Polls already
 * retry for 120 s inside pollWithRecovery, so their exhaustion still stops here.
 */
const AUTO_RECOVERY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 8_000, 8_000];
const autoRecoverable = (error: unknown) =>
  transientPollError(error) &&
  !(error instanceof ApiError && error.code === "INTERACTIVE_POLL_TIMEOUT");
export type ExportState =
  "not-requested" | "queued" | "building" | "validating" | "ready" | "failed" | "superseded";
export type InteractiveSnapshot = {
  appearanceAvailable?: boolean;
  skinAvailable?: boolean;
  supportedSkins?: readonly SkinId[];
  binding?: string;
  previewState: PreviewState;
  exportState: ExportState;
  operation?: Operation;
  model?: ModelResult;
  modelBinding?: string;
  modelOperation?: Operation;
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
  // Proof for the displayed geometry, independent of the current appearance operation.
  private modelProof?: Pick<
    NonNullable<Operation["exportReceipt"]>,
    "packetModelSha256" | "runtimeRevision"
  >;
  private recovered = false;
  private fence = { revision: 0, stateHash: null as string | null };
  private creating: Promise<Operation> | undefined;
  private desired?: {
    binding: string;
    baseBinding: string;
    poseBinding: string;
    candidateId: string;
    ready: boolean;
    appearance?: Appearance;
    skin?: Skin;
  };
  private mutation?: Prepare;
  private handAtlas?: LoadedVariants;
  private autoRecoveries = 0;
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
  select(
    binding: string,
    candidateId: string,
    ready: boolean,
    appearance?: Appearance,
    skin?: Skin,
    baseBinding = binding,
    poseBinding = baseBinding,
  ) {
    if (
      this.value.binding === binding &&
      this.desired?.binding === binding &&
      this.desired.ready === ready &&
      sameAppearance(this.desired.appearance, appearance) &&
      sameSkin(this.desired.skin, skin)
    )
      return;
    const changed = this.desired?.binding !== binding;
    const poseChanged = this.desired?.poseBinding !== poseBinding;
    this.autoRecoveries = 0;
    const baseChanged = poseChanged || this.desired?.baseBinding !== baseBinding;
    if (baseChanged) this.modelProof = undefined;
    if (
      !sameAppearance(this.desired?.appearance, appearance) ||
      !sameSkin(this.desired?.skin, skin)
    )
      this.recovered = false; // Capability depends on the exact skin/width combination.
    this.desired = { binding, baseBinding, poseBinding, candidateId, ready, appearance, skin };
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
      ...(baseChanged
        ? {
            model: undefined,
            modelBinding: undefined,
            modelOperation: undefined,
          }
        : {}),
      ...(poseChanged ? { localSurface: undefined } : {}),
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
    this.autoRecoveries = 0;
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
  /** Revoke the old file immediately, retaining the pose/body/hand display and its binding.
   * The next debounced prepare supersedes server authority. Do not cancel the shared
   * base preparation on every slider event or discard the model before select runs.
   */
  invalidateAppearance() {
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.mutation = undefined;
    this.recovered = false;
    this.publish({ binding: undefined, operation: undefined, exportState: "superseded" });
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
      !sameSkin(op.skin, previous.skin) ||
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
          desired.skin,
        );
        if (generation !== this.generation) return;
        this.fence = { revision: recovery.currentRevision, stateHash: recovery.currentStateHash };
        this.head = recovery.operation ?? undefined;
        this.publish({
          appearanceAvailable: recovery.appearanceExport?.available === true,
          skinAvailable: recovery.skinExport?.available === true,
          supportedSkins: recovery.skinExport?.available
            ? recovery.skinExport.supportedIds
            : ["default"],
        });
        resumed = recovery.operation;
        if (
          resumed &&
          (!sameAppearance(resumed.appearance, desired.appearance) ||
            !sameSkin(resumed.skin, desired.skin))
        )
          resumed = null;
        this.recovered = true;
      }
      if (desired.appearance && this.value.appearanceAvailable !== true)
        throw new ApiError(503, "OUTLINE_DISABLED", "");
      if (
        desired.skin &&
        (this.value.skinAvailable !== true || !this.value.supportedSkins?.includes(desired.skin.id))
      )
        throw new ApiError(503, "SKIN_DISABLED", "");
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
            ...(desired.skin ? { skin: desired.skin } : {}),
          };
        const request = this.mutation;
        const creating = this.transport.prepare(this.target, request).then((next) => {
          if (
            next.revision !== request.revision ||
            next.candidateId !== request.candidateId ||
            !sameAppearance(next.appearance, request.appearance) ||
            !sameSkin(next.skin, request.skin)
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
      // Settles with the verified model, or undefined if it failed; never rejects.
      let modelLoad: Promise<ModelResult | undefined> = Promise.resolve(undefined);
      const inputAt = performance.now();
      const pollingDeadline = Date.now() + 10 * 60_000;
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
          const retained =
            this.value.model && this.value.modelBinding === desired.baseBinding && this.modelProof;
          // Keep the existing surface while the new file is prepared. Only a fresh
          // receipt proving identical geometry permits skipping another large packet.
          if (retained && !op.exportReceipt) {
            // Export starts below; the old packet is display-only, never file authority.
          } else if (
            retained &&
            op.exportReceipt?.packetModelSha256 === this.modelProof?.packetModelSha256 &&
            op.exportReceipt?.runtimeRevision === this.modelProof?.runtimeRevision
          ) {
            requestedModel = true;
            modelLoad = Promise.resolve(this.value.model);
          } else {
            requestedModel = true;
            if (retained) this.publish({ model: undefined, modelBinding: undefined });
            const immutable = op;
            const loading = this.transport.model(
              this.target,
              immutable,
              desired.candidateId,
              signal,
            );
            modelLoad = loading.catch(() => undefined);
            void loading
              .then((model) => {
                if (
                  generation !== this.generation ||
                  this.value.operation?.stateHash !== immutable.stateHash
                )
                  return;
                this.publish({
                  model,
                  modelBinding: desired.baseBinding,
                  modelOperation: immutable,
                  modelError: false,
                  localSurface: undefined,
                });
                this.modelProof = this.value.operation?.exportReceipt ?? undefined;
                measure("packet", inputAt);
              })
              .catch((error) => {
                if (!signal.aborted && generation === this.generation) {
                  if (expiredError(error)) this.expire();
                  else this.publish({ modelError: true });
                }
              });
          }
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
          if (this.value.modelOperation?.stateHash === op.stateHash && this.value.model)
            this.modelProof = op.exportReceipt ?? undefined;
          const variants = this.transport.variants?.bind(this.transport);
          if (variants) {
            const immutable = op;
            // Binary v2 states have no hand-variant atlas (the server answers 409 at once):
            // skip the request, keeping the authoritative surface and server-side hands.
            void modelLoad
              .then((model) =>
                signal.aborted || model?.packet.canonicalEncoding === BINARY_STATE_ENCODING
                  ? undefined
                  : variants(this.target, immutable, signal),
              )
              .then((atlas) => {
                if (!atlas) return;
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
          this.autoRecoveries = 0;
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
        const next = await pollWithRecovery(
          (attemptSignal) => this.transport.poll(this.target, op, attemptSignal),
          signal,
          Math.min(pollingDeadline, Date.parse(op.expiresAt)),
        );
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
      if (autoRecoverable(error) && this.autoRecoveries < AUTO_RECOVERY_DELAYS_MS.length) {
        this.scheduleRecovery(generation);
        return;
      }
      this.publish({ error: true, failure: error, exportState: "failed" });
      measure("error", performance.now());
    }
  }
  /** Keep the current "preparing" state and run again; the user sees no failure meanwhile. */
  private scheduleRecovery(generation: number) {
    const base = AUTO_RECOVERY_DELAYS_MS[this.autoRecoveries++]!;
    const delay = base * (0.8 + Math.random() * 0.4);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.desired?.ready) return;
      // Same recovery rules as retry(): find an accepted operation before any create, and
      // reuse an uncertain POST's exact body and idempotency key.
      if (this.value.operation) {
        this.recovered = false;
        this.mutation = undefined;
      }
      this.generation++;
      this.controller?.abort();
      void this.run(this.generation);
    }, delay);
  }
  retry() {
    if (!this.desired?.ready) return;
    this.autoRecoveries = 0;
    // Re-read the current capability/fence: a failed initial probe must not stay
    // unavailable forever after the service recovers. Keep uncertain POST bodies.
    this.recovered = false;
    if (this.value.operation && transientPollError(this.value.failure)) {
      this.mutation = undefined;
    }
    // Retrying an uncertain POST reuses its exact body/idempotency key.
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.publish({ error: false, failure: undefined, modelError: false, exportState: "queued" });
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
