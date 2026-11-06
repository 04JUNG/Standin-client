import { z } from "zod";
import { validRotation } from "../preview/modelContract";
import { digest, ownedPath } from "../interactive/contract";
export const VERSION = "standin.candidate-preparation.v1" as const;
const id = z.string().min(1).max(200);
export const candidateState = z.enum([
  "queued",
  "running",
  "ready_refined",
  "ready_base",
  "unsupported",
  "failed_retryable",
  "invalidated",
  "cancelled",
]);
export const terminal = (status: string) => !["queued", "running"].includes(status);
export const usable = (status: string) => ["ready_refined", "ready_base"].includes(status);
export const sourceCameraSchema = z.object({
  version: z.enum(["candidate-camera-v1", "candidate-camera-v2"]),
  rotation: z.array(z.array(z.number().finite()).length(3)).length(3).refine(validRotation),
  source_bvh_sha256: digest,
  projection: z.enum(["orthographic", "perspective"]).optional(),
  distance_torso: z.number().positive().nullable().optional(),
});
export const previewSchema = z.object({
  schemaVersion: z.literal("candidate-source-preview-v1"),
  format: z.literal("bvh"),
  url: ownedPath,
  sha256: digest,
  bytes: z.number().int().positive().max(2_000_000),
  contextHash: digest,
  sourceSha256: digest,
  camera: sourceCameraSchema.nullish(),
  displayOnly: z.literal(true),
});
export const sourceReceiptSchema = z.object({
  schema: z.literal("candidate-source-receipt-v1"),
  contextHash: digest,
  sourceFingerprint: digest,
  contextFingerprint: digest,
  qualityScope: z.literal("source_only"),
  skinSafe: z.literal(false),
  finalFileVerified: z.literal(false),
});
export const preparedCandidateSchema = z.object({
  personIndex: z.number().int().nonnegative(),
  candidateId: id,
  resultId: id,
  contextHash: digest,
  status: candidateState,
  reasonCode: z.string().max(200),
  qualityScope: z.literal("source_only"),
  sourceSha256: digest.or(z.literal("")),
  outputSha256: digest.nullable(),
  modelUrl: ownedPath.nullable(),
  previewAsset: previewSchema.nullable(),
  validationReceipt: sourceReceiptSchema.nullable(),
});
export const batchSchema = z.object({
  schemaVersion: z.literal(VERSION),
  batchId: id,
  revision: z.number().int().nonnegative(),
  contextHash: digest,
  candidateSetRevision: id,
  eventSequence: z.number().int().nonnegative(),
  status: z.enum(["queued", "running", "completed", "invalidated", "cancelled"]),
  terminal: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().max(64),
  top5Ready: z.boolean(),
  expiresAt: z.string().datetime(),
  candidates: z.array(preparedCandidateSchema).max(64),
});
export type SourcePreview = z.infer<typeof previewSchema>;
export type PreparedCandidate = z.infer<typeof preparedCandidateSchema>;
export type PreparedBatch = z.infer<typeof batchSchema>;
export type CandidateIdentity = { personIndex: number; candidateId: string; sourceSha256?: string };
export function readBatch(raw: unknown, expected: CandidateIdentity[]): PreparedBatch {
  const batch = batchSchema.parse(raw);
  const keys = batch.candidates.map((c) => JSON.stringify([c.personIndex, c.candidateId]));
  if (
    batch.total !== expected.length ||
    batch.candidates.length !== expected.length ||
    new Set(keys).size !== keys.length ||
    new Set(batch.candidates.map((c) => c.resultId)).size !== batch.candidates.length ||
    expected.some((identity) => {
      const candidate = batch.candidates.find(
        (c) => c.personIndex === identity.personIndex && c.candidateId === identity.candidateId,
      );
      return (
        !candidate ||
        (identity.sourceSha256 !== undefined && candidate.sourceSha256 !== identity.sourceSha256)
      );
    }) ||
    batch.terminal !== batch.candidates.filter((c) => terminal(c.status)).length ||
    (batch.top5Ready && (batch.terminal !== batch.total || batch.status !== "completed")) ||
    batch.candidates.some(
      (c) =>
        usable(c.status) &&
        (!c.outputSha256 ||
          !c.previewAsset ||
          !c.validationReceipt ||
          c.previewAsset.sha256 !== c.outputSha256 ||
          c.previewAsset.sourceSha256 !== c.sourceSha256 ||
          c.previewAsset.contextHash !== c.contextHash ||
          c.validationReceipt.contextHash !== c.contextHash ||
          c.previewAsset.url !== c.modelUrl ||
          (c.previewAsset.camera && c.previewAsset.camera.source_bvh_sha256 !== c.sourceSha256)),
    )
  )
    throw new Error("포즈 준비 결과가 변경되었습니다. 다시 시도해 주세요.");
  return batch;
}
export function candidateLabel(candidate: PreparedCandidate): string {
  if (candidate.status === "ready_refined") return "보정됨";
  if (candidate.status === "ready_base") return "원본 유지";
  if (candidate.status === "unsupported") return "현재 조건 미지원";
  if (candidate.status === "failed_retryable") return "준비하지 못했어요";
  return "준비 중";
}
export const reuseSchema = z.object({
  schemaVersion: z.literal(VERSION),
  batchId: id,
  contextHash: digest,
  selections: z
    .array(
      z.object({
        personIndex: z.number().int().nonnegative(),
        candidateId: id,
        resultId: id,
        contextHash: digest,
        outputSha256: digest,
        sourceReceipt: sourceReceiptSchema,
        sourceUrl: ownedPath,
        exportUrl: ownedPath,
        refined: z.boolean(),
        reasonCode: z.string(),
        adjustedLimbs: z.array(z.string()),
        thumbnailUrl: z.null(),
      }),
    )
    .min(1)
    .max(64),
  targetApplicationRequired: z.literal(true),
  finalFileVerified: z.literal(false),
});
