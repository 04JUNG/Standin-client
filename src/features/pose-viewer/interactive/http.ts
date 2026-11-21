import { SKIN_ASSET_PINS } from "../skin/skinAssetPins";
import { skinReceiptSchema } from "../skin/skinReceipt";
import { skinPreviewSchema, checkSkinPreviewPaths } from "../skin/skinPreview";
import { skinSchema, skinCapabilitySchema, sameSkin, type Skin } from "../skin/skin";
import { skinUnavailableSchema, type SkinUnavailable } from "../skin/skinScope";
import { z } from "zod";
import {
  appearanceSchema,
  appearanceCapabilitySchema,
  outlineReceiptSchema,
  sameAppearance,
  type Appearance,
} from "../outline/appearance";
import { apiFetch, apiFetchResponse } from "@/shared/api/client";
import { digest, ownedPath } from "./contract";
import { boundedBytes, verifyBytes, BoundedQueue } from "./assets";
import {
  frameSchema,
  identitySchema,
  loadBinarySolvedState,
  loadSolvedPacket,
  prepareHandVariants,
  type LoadedVariants,
} from "./solved";
import { MEDIA_TYPE as SOLVED_V2_MEDIA_TYPE } from "./shared/interactive_pose_v2.mjs";
const SOLVED_V1_MEDIA_TYPE = "application/vnd.standin.solved-pose-state-v1+json";
export const exportReceiptSchema = z
  .object({
    schema: z.literal("interactive-fbx-receipt-v1"),
    operationId: z.string(),
    revision: z.number().int().positive(),
    stateHash: digest,
    artifactSha256: digest,
    artifactBytes: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024),
    runtimeRevision: digest,
    packetModelSha256: digest,
    solverVersion: z.literal("chain-transport-v3.2.5"),
    validationVersion: z.literal("final-fbx-v1"),
    initialFbxRequired: z.literal(true),
    nativeSaved: z.literal(false),
    appearance: appearanceSchema.optional(),
    outline: outlineReceiptSchema.optional(),
    skin: skinSchema.optional(),
    skinProof: skinReceiptSchema.optional(),
  })
  .strict();
export const operationSchema = z.object({
  schemaVersion: z.literal("standin.interactive-http.v1"),
  operationId: z.string().regex(/^op_[A-Za-z0-9-]{1,100}$/),
  candidateId: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  stateHash: digest.nullable(),
  selectionHash: digest,
  appearance: appearanceSchema.optional(),
  skin: skinSchema.optional(),
  skinPreview: skinPreviewSchema.optional(),
  previewState: z.enum(["solving", "authoritative", "error", "superseded", "cancelled"]),
  exportState: z.enum([
    "not-requested",
    "queued",
    "building",
    "validating",
    "ready",
    "failed",
    "superseded",
    "cancelled",
  ]),
  eventSequence: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  modelUrl: ownedPath.nullable(),
  fileUrl: ownedPath.nullable(),
  posterUrl: ownedPath.nullable(),
  errorCode: z.string().nullable(),
  exportReceipt: exportReceiptSchema.nullable(),
});
export type Operation = z.infer<typeof operationSchema>;
export type Prepare = {
  schemaVersion: "standin.interactive-http.v1";
  candidateId: string;
  revision: number;
  expectedRevision: number;
  expectedStateHash: string | null;
  mutationId: string;
  appearance?: Appearance;
  skin?: Skin;
};
export type Target = { jobId: string; personIndex: number };
export function operationBase(target: Target) {
  if (!target.jobId || !Number.isSafeInteger(target.personIndex) || target.personIndex < 0)
    throw Error("invalid target");
  return `/v1/analysis/jobs/${encodeURIComponent(target.jobId)}/people/${target.personIndex}/interactive-state`;
}
export function operationPath(target: Target, operationId: string) {
  return `${operationBase(target)}/${encodeURIComponent(operationId)}`;
}
export function checkOperation(raw: unknown, target: Target): Operation {
  const op = operationSchema.parse(raw);
  if (
    op.skin &&
    op.appearance &&
    op.appearance.width !== 2 &&
    !SKIN_ASSET_PINS.some(
      (pin) =>
        pin.continuousOutline &&
        pin.skinId === op.skin!.id &&
        pin.manifestSha256 === op.skinPreview?.assetManifestSha256 &&
        pin.characterId === op.skinPreview.compatibility.characterId &&
        pin.characterSha256 === op.skinPreview.compatibility.characterSha256,
    )
  )
    throw Error("unsupported skin outline combination");
  const root = operationPath(target, op.operationId);
  if (op.skinPreview) {
    checkSkinPreviewPaths(op.skinPreview, root);
    if (!op.skin || !sameSkin(op.skin, op.skinPreview.skin))
      throw Error("skin preview choice changed");
  }
  if (op.skin && op.previewState === "authoritative" && !op.skinPreview)
    throw Error("skin preview missing");
  for (const [suffix, url] of [
    ["model", op.modelUrl],
    ["file", op.fileUrl],
    ["poster", op.posterUrl],
  ] as const)
    if (url !== null && url !== `${root}/${suffix}`) throw Error("artifact escaped operation");
  if ((op.exportState === "ready" || op.previewState === "authoritative") && !op.stateHash)
    throw Error("missing state hash");
  if (Date.parse(op.expiresAt) <= Date.now()) throw Error("operation expired");
  if (
    op.exportState === "ready" &&
    (!op.exportReceipt ||
      op.exportReceipt.operationId !== op.operationId ||
      op.exportReceipt.revision !== op.revision ||
      op.exportReceipt.stateHash !== op.stateHash)
  )
    throw Error("export receipt binding changed");
  const receipt = op.exportReceipt;
  if (
    receipt?.skinProof &&
    receipt.outline &&
    (receipt.outline.proof.output_scope !== "full" ||
      receipt.outline.proof.character_id !== receipt.skinProof.compatibility.characterId ||
      receipt.outline.proof.character_sha256 !== receipt.skinProof.compatibility.characterSha256)
  )
    throw Error("skin outline target changed");
  if (
    receipt?.skinProof &&
    op.skinPreview &&
    (receipt.skinProof.assetManifestSha256 !== op.skinPreview.assetManifestSha256 ||
      receipt.skinProof.assetVersion !== op.skinPreview.assetVersion ||
      receipt.skinProof.uvSha256 !== op.skinPreview.uv.sha256 ||
      Object.entries(receipt.skinProof.compatibility).some(
        ([key, value]) =>
          op.skinPreview!.compatibility[key as keyof typeof op.skinPreview.compatibility] !== value,
      ))
  )
    throw Error("skin preview/export assets changed");
  if (
    op.appearance?.width === 0 ||
    op.skin?.id === "default" ||
    (receipt &&
      (!sameSkin(op.skin, receipt.skin) ||
        !!op.skin !== !!receipt.skinProof ||
        (receipt.skinProof &&
          (!sameSkin(op.skin, receipt.skinProof.skin) ||
            (receipt.outline
              ? receipt.outline.sourceArtifactSha256 !== receipt.skinProof.artifactSha256
              : receipt.artifactSha256 !== receipt.skinProof.artifactSha256 ||
                receipt.artifactBytes !== receipt.skinProof.artifactBytes))))) ||
    (receipt &&
      (!sameAppearance(op.appearance, receipt.appearance) ||
        !!op.appearance !== !!receipt.outline ||
        (receipt.outline &&
          (!sameAppearance(op.appearance, receipt.outline.appearance) ||
            receipt.artifactSha256 !== receipt.outline.artifactSha256 ||
            receipt.artifactBytes !== receipt.outline.artifactBytes))))
  )
    throw Error("appearance receipt changed");
  return op;
}
export const receiptSchema = z
  .object({
    schema: z.literal("interactive-fbx-receipt-v1"),
    stateHash: digest,
    revision: z.number().int().positive(),
    operation: z.string(),
    identity: identitySchema,
    verified: z.literal(true),
    artifactSha256: digest,
    artifactBytes: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024),
    runtimeRevision: z.string().min(1),
    packetModelSha256: digest,
    reimportModelSha256: digest,
    correspondence: z.object({
      topology: z.literal(true),
      jointIdentity: z.literal(true),
      skinIdentity: z.literal(true),
      maxPositionErrorM: z.number().finite().nonnegative().max(0.0001),
      maxMatrixError: z.number().finite().nonnegative(),
      maxWeightError: z.number().finite().nonnegative().max(0.000001),
      maxNormalError: z.number().finite().nonnegative().max(0.0001),
      positionToleranceM: z.literal(0.0001),
      matrixTolerance: z.literal(0.00001),
      weightTolerance: z.literal(0.000001),
    }),
  })
  .passthrough();
export type Receipt = z.infer<typeof receiptSchema>;
/** v1 typed-JSON or v2 binary state; `packet.canonicalEncoding` tells them apart. */
export type ModelResult = (
  Awaited<ReturnType<typeof loadSolvedPacket>> | Awaited<ReturnType<typeof loadBinarySolvedState>>
) & {
  frame?: z.infer<typeof frameSchema>;
};
export interface InteractiveTransport {
  variants?(target: Target, op: Operation, signal: AbortSignal): Promise<LoadedVariants>;
  head(
    target: Target,
    candidateId: string,
    signal: AbortSignal,
    appearance?: Appearance,
    skin?: Skin,
  ): Promise<{
    appearanceExport?: z.infer<typeof appearanceCapabilitySchema>;
    skinExport?: z.infer<typeof skinCapabilitySchema>;
    /** Why `skinExport` is unavailable; omitted by older servers. */
    skinUnavailable?: SkinUnavailable;
    currentRevision: number;
    currentStateHash: string | null;
    operation: Operation | null;
  }>;
  prepare(target: Target, body: Prepare): Promise<Operation>;
  poll(target: Target, op: Operation, signal: AbortSignal): Promise<Operation>;
  cancel(target: Target, op: Operation): Promise<void>;
  export(target: Target, op: Operation, signal: AbortSignal): Promise<Operation>;
  model(
    target: Target,
    op: Operation,
    candidateId: string,
    signal: AbortSignal,
  ): Promise<ModelResult>;
  file(
    target: Target,
    op: Operation,
    signal: AbortSignal,
  ): Promise<{
    bytes: Uint8Array;
    receipt: {
      stateHash: string;
      revision: number;
      operation: string;
      artifactSha256: string;
      artifactBytes: number;
    };
  }>;
}
const packetDownloads = new BoundedQueue(2);
const packetParses = new BoundedQueue(1);
const jsonOptions = (signal?: AbortSignal) => ({
  auth: false,
  cache: "no-store" as const,
  ...(signal ? { signal } : {}),
});
export const interactiveHttp: InteractiveTransport = {
  async variants(target, op, signal) {
    return packetDownloads.run(async () => {
      const response = await apiFetchResponse(
        `${operationPath(target, op.operationId)}/variants`,
        jsonOptions(signal),
      );
      if (
        response.headers.get("Content-Type")?.split(";")[0] !==
          "application/vnd.standin.hand-variants-v1+json" ||
        response.headers.get("X-Standin-State-Hash") !== op.stateHash ||
        response.headers.get("X-Standin-Revision") !== String(op.revision)
      )
        throw Error("stale hand atlas");
      const sha = digest.parse(response.headers.get("X-Standin-Atlas-SHA256"));
      const bytes = await boundedBytes(response, 64 * 1024 * 1024, signal);
      signal.throwIfAborted();
      return packetParses.run(() => prepareHandVariants(new Uint8Array(bytes), sha), signal);
    }, signal);
  },
  async head(target, candidateId, signal, appearance, skin) {
    const raw = z
      .object({
        schemaVersion: z.literal("standin.interactive-http.v1"),
        currentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        currentStateHash: digest.nullable(),
        operation: z.unknown().nullable(),
        // Unknown/malformed future capability stays unavailable on old clients.
        appearanceExport: z.unknown().optional(),
        skinExport: z.unknown().optional(),
        skinUnavailable: z.unknown().optional(),
      })
      .parse(
        await apiFetch(
          `${operationBase(target)}?candidateId=${encodeURIComponent(candidateId)}${appearance ? `&appearance=${encodeURIComponent(JSON.stringify(appearance))}` : ""}${skin ? `&skin=${encodeURIComponent(JSON.stringify(skin))}` : ""}`,
          jsonOptions(signal),
        ),
      );
    const operation = raw.operation ? checkOperation(raw.operation, target) : null;
    if (
      operation &&
      (operation.candidateId !== candidateId ||
        operation.revision !== raw.currentRevision ||
        operation.stateHash !== raw.currentStateHash ||
        !sameAppearance(operation.appearance, appearance) ||
        !sameSkin(operation.skin, skin))
    )
      throw Error("head binding changed");
    const capability = appearanceCapabilitySchema.safeParse(raw.appearanceExport);
    const skinCapability = skinCapabilitySchema.safeParse(raw.skinExport);
    const skinUnavailable = skinUnavailableSchema.safeParse(raw.skinUnavailable);
    return {
      ...raw,
      operation,
      appearanceExport: capability.success ? capability.data : undefined,
      skinExport: skinCapability.success ? skinCapability.data : undefined,
      // A reason only qualifies an unavailable capability; it never grants or denies one.
      skinUnavailable:
        skinCapability.success && !skinCapability.data.available && skinUnavailable.success
          ? skinUnavailable.data
          : undefined,
    };
  },
  async prepare(target, body) {
    // Do not abort a create on route remount: learn its id before cancellation, avoiding orphan work.
    return checkOperation(
      await apiFetch(operationBase(target), { ...jsonOptions(), method: "POST", body }),
      target,
    );
  },
  async poll(target, op, signal) {
    return checkOperation(
      await apiFetch(operationPath(target, op.operationId), jsonOptions(signal)),
      target,
    );
  },
  async cancel(target, op) {
    await apiFetch(operationPath(target, op.operationId), { ...jsonOptions(), method: "DELETE" });
  },
  async export(target, op, signal) {
    return checkOperation(
      await apiFetch(`${operationPath(target, op.operationId)}/export`, {
        ...jsonOptions(signal),
        method: "POST",
        body: { revision: op.revision, stateHash: op.stateHash },
      }),
      target,
    );
  },
  async model(target, op, candidateId, signal) {
    if (!op.stateHash || !op.modelUrl) throw Error("model not ready");
    const modelUrl = op.modelUrl,
      stateHash = op.stateHash;
    return packetDownloads.run(async () => {
      const response = await apiFetchResponse(modelUrl, jsonOptions(signal));
      // The BFF chooses per operation: v1 JSON envelope, or raw v2 bytes for clients that
      // advertised `solved-state-binary-v2`. Anything else is refused before reading the body.
      const contentType = response.headers.get("Content-Type")?.split(";")[0];
      if (contentType !== SOLVED_V1_MEDIA_TYPE && contentType !== SOLVED_V2_MEDIA_TYPE)
        throw Error("invalid packet type");
      if (
        response.headers.get("X-Standin-State-Hash") !== op.stateHash ||
        response.headers.get("X-Standin-Revision") !== String(op.revision)
      )
        throw Error("packet headers changed");
      const bytes = await boundedBytes(response, 64 * 1024 * 1024, signal);
      return packetParses.run(async () => {
        const expected = {
          operationId: op.operationId,
          revision: op.revision,
          stateHash,
          personIndex: target.personIndex,
          candidateId,
        };
        const result =
          contentType === SOLVED_V2_MEDIA_TYPE
            ? await loadBinarySolvedState(new Uint8Array(bytes), expected)
            : await loadSolvedPacket(JSON.parse(new TextDecoder().decode(bytes)), expected);
        // v2 Converter owns a fixed square, hip-origin frame. Its projection
        // already contains continuous search orientation, focal length and
        // scope centering. Legacy packets still need their explicit adapter.
        return result.state.identity.solver.adapterVersion ===
          "post-frozen-file-canonical-snapshot-v2"
          ? {
              ...result,
              frame: frameSchema.parse({
                target: [0, 0, 0],
                referenceAspect: 1,
                projectionIncludesCenterScaleCrop: true,
              }),
            }
          : result;
      }, signal);
    }, signal);
  },
  async file(target, op, signal) {
    checkOperation(op, target);
    if (!op.stateHash || !op.fileUrl || op.exportState !== "ready") throw Error("file not ready");
    const response = await apiFetchResponse(op.fileUrl, jsonOptions(signal));
    if (
      response.headers.get("Content-Type")?.split(";")[0] !== "application/octet-stream" ||
      response.headers.get("X-Standin-Artifact-Contract") !==
        (op.appearance
          ? "outlined-fbx-v1"
          : op.skin
            ? "textured-fbx-v1"
            : "interactive-fbx-receipt-v1") ||
      response.headers.get("X-Standin-State-Hash") !== op.stateHash ||
      response.headers.get("X-Standin-Revision") !== String(op.revision)
    )
      throw Error("file receipt changed");
    const receipt = exportReceiptSchema.parse(op.exportReceipt);
    const sha = digest.parse(response.headers.get("X-Standin-Artifact-SHA256"));
    if (
      receipt.artifactSha256 !== sha ||
      receipt.stateHash !== op.stateHash ||
      receipt.revision !== op.revision ||
      receipt.operationId !== op.operationId
    )
      throw Error("file receipt changed");
    const size = z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024)
      .parse(Number(response.headers.get("Content-Length")));
    if (receipt.artifactBytes !== size) throw Error("receipt length changed");
    const bytes = await boundedBytes(response, size, signal);
    if (bytes.byteLength !== size) throw Error("file length changed");
    await verifyBytes(bytes, sha);
    signal.throwIfAborted();
    const delivered = {
      stateHash: op.stateHash,
      revision: op.revision,
      operation: op.operationId,
      artifactSha256: sha,
      artifactBytes: size,
    };
    return { bytes: new Uint8Array(bytes), receipt: delivered };
  },
};
