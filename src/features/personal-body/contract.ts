import { z } from "zod";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const modelSchema = z.object({
  localModelId: z.string().uuid(),
  name: z.string().min(1).max(64),
  sourceHash: sha,
  format: z.enum(["fbx", "cs3c"]),
  version: z.number().int().positive(),
  importerVersion: z.string(),
  normalizationVersion: z.string(),
  rigMappingVersion: z.string(),
  converterVersion: z.string(),
  converterFingerprint: sha.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  capabilities: z.object({
    bodyPose: z.literal(true),
    leftHand: z.boolean(),
    rightHand: z.boolean(),
  }),
});
export type LocalModel = z.infer<typeof modelSchema>;
export const progressSchema = z.object({
  jobId: z.string(),
  stage: z.string(),
  progress: z.number().min(0).max(1).optional(),
});
export type LocalProgress = z.infer<typeof progressSchema>;
export const capabilitySchema = z.object({
  available: z.boolean(),
  formats: z.array(z.enum(["fbx", "cs3c"])),
  reason: z.string().optional(),
});
export const messages: Record<string, string> = {
  SCOPE_UNSUPPORTED: "이 체형은 전신 FBX로 저장할 수 있어요. 저장할 부분을 전신으로 바꿔 주세요.",
  CS3C_DECODER_UNAVAILABLE: "이 앱은 아직 이 CS3C 파일을 준비할 수 없어요. FBX 파일을 골라 주세요.",
  HAND_UNSUPPORTED: "이 체형은 손 모양을 바꿀 수 없어요.",
  UNSUPPORTED_REST_POSE: "팔을 양옆으로 펼친 기본 자세의 파일을 골라 주세요.",
  INVALID_SKIN: "몸의 움직임을 확인하지 못했어요. 다른 파일을 골라 주세요.",
  UNSUPPORTED_MATERIAL:
    "이 파일의 색상이나 이미지 표현은 아직 지원하지 않아요. 다른 파일을 골라 주세요.",
  UNSUPPORTED_TRANSFORM: "이 모델의 크기나 방향을 확인하지 못했어요. 다른 파일을 골라 주세요.",
  RUNTIME_MISMATCH: "체형 준비 기능의 버전이 바뀌었어요. 파일 교체로 다시 준비해 주세요.",
  SOURCE_CHANGED: "등록한 체형의 버전이 바뀌었어요. 파일 교체로 다시 준비해 주세요.",
  SNAPSHOT_MISMATCH: "확인한 결과와 파일이 달라요. 다시 준비해 주세요.",
  UNSUPPORTED_RIG: "아직 지원하지 않는 모델이에요. 다른 파일을 골라 주세요.",
  BUSY: "다른 체형을 준비하고 있어요. 잠시 후 다시 시도해 주세요.",
  CANCELLED: "체형 준비를 취소했어요.",
  RUNTIME_UNAVAILABLE:
    "이 앱에는 체형을 준비하는 기능이 포함되지 않았어요. 앱 업데이트를 확인해 주세요.",
  UNSUPPORTED_FORMAT: "FBX 또는 CS3C 파일을 골라 주세요.",
  UNSUPPORTED_MODEL: "아직 지원하지 않는 모델이에요. 다른 파일을 골라 주세요.",
  NO_SKELETON: "포즈를 적용할 관절이 없는 모델이에요.",
  LIMIT_EXCEEDED: "파일이 너무 커서 준비하지 못했어요. 더 작은 파일을 골라 주세요.",
  TIMEOUT: "체형 준비가 오래 걸려 중단했어요. 다른 파일로 다시 시도해 주세요.",
  STORAGE_FAILED: "기기에 저장하지 못했어요. 남은 저장 공간을 확인해 주세요.",
  STALE_RESULT: "체형이나 포즈가 바뀌었어요. 다시 준비해 주세요.",
  POSE_UNAVAILABLE: "저장할 포즈를 확인하지 못했어요. 후보를 다시 골라 주세요.",
};
export function localError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return messages[code] ?? "체형을 준비하지 못했어요. 다른 파일을 고르거나 다시 시도해 주세요.";
}
export function modelIdentity(model: LocalModel) {
  return [
    model.localModelId,
    model.sourceHash,
    model.version,
    model.importerVersion,
    model.normalizationVersion,
    model.rigMappingVersion,
    model.converterVersion,
    model.converterFingerprint,
  ];
}
export function resultIdentity(model: LocalModel, poseHash: string, hands: unknown, scope: string) {
  return JSON.stringify([modelIdentity(model), poseHash, hands, scope, "fbx"]);
}
