/**
 * 서버 오류 코드 → 사용자에게 보여줄 문구.
 *
 * 서버가 내려준 `message`는 화면에 쓰지 않는다(docs/06 §4). 서버 문구는 언제든 바뀌고,
 * 영어이거나 기술적일 수 있으며, 계정 존재 여부 같은 정보를 흘릴 수 있다. 앱은 `code`만
 * 보고 자기 문구를 고른다.
 *
 * 코드 목록은 BFF(`Standin-app-server`)의 실제 errorEnvelope 호출부 기준이다.
 */
const MESSAGES: Record<string, string> = {
  UPDATE_REQUIRED: "새 버전으로 업데이트해야 Standin을 사용할 수 있습니다.",
  SCENE_CONTRACT_UNSUPPORTED:
    "지금은 이 저장 방식을 사용할 수 없어요. 작업을 다시 열어 확인해 주세요.",
  SCENE_REVIEW_REQUIRED: "결과를 다시 준비하고 확인한 뒤 저장해 주세요.",
  SCENE_REVIEW_EXPIRED: "확인 시간이 지났어요. 결과를 다시 준비하고 확인해 주세요.",
  SCENE_SOURCE_CHANGED: "원본이나 선택이 바뀌었어요. 포즈·체형·손·저장 범위를 다시 확인해 주세요.",
  SCENE_UNSUPPORTED_BODY: "이 체형은 자동 보정할 수 없어요. 다른 체형을 골라 주세요.",
  SCENE_OBSERVATION_MISSING:
    "러프의 인물 배치를 확인하지 못했어요. 다른 포즈를 고르거나 다시 분석해 주세요.",
  SCENE_UNAVAILABLE: "지금은 파일을 준비할 수 없어요. 잠시 후 다시 시도해 주세요.",
  SCENE_BUSY: "요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
  SCENE_TIMEOUT: "시간 안에 준비하지 못했어요. 결과를 다시 준비하고 확인해 주세요.",
  SCENE_INTEGRITY:
    "확인한 결과와 파일이 일치하지 않아 저장하지 않았어요. 결과를 다시 확인해 주세요.",
  SCENE_FAILED: "결과를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
  GENERATED_CHECKS_FAILED:
    "만든 포즈가 확인 과정을 통과하지 못했어요. 다른 후보를 선택하거나 그림을 바꿔 다시 분석해 주세요.",
  GENERATED_FBX_REQUIRED: "새로 만든 포즈는 저장 전 화면에서 최종 모습을 다시 확인해 주세요.",
  GENERATED_SOURCE_UNAVAILABLE:
    "새로 만든 포즈의 원본을 확인하지 못했어요. 다른 후보를 선택하거나 다시 분석해 주세요.",
  GENERATED_INDIVIDUAL_ONLY: "새로 만든 포즈가 있는 컷은 인물마다 따로 저장해 주세요.",
  PREVIEW_NOT_READY: "저장할 파일을 다시 준비해야 해요. 결과를 다시 확인해 주세요.",
  PREVIEW_UNAVAILABLE: "포즈 원본을 찾지 못했어요. 다른 후보를 선택하거나 다시 분석해 주세요.",
  PREVIEW_SOURCE_CHANGED: "포즈 원본이 바뀌었어요. 후보 화면에서 다시 선택해 주세요.",
  PREVIEW_HASH_MISMATCH:
    "선택한 포즈와 파일이 같은지 확인하지 못했어요. 다른 후보를 선택하거나 다시 분석해 주세요.",
  INVALID_SELECTION:
    "이 작업에서 선택한 포즈를 확인하지 못했어요. 후보 화면에서 다시 선택해 주세요.",
  HAND_SELECTION_DISABLED: "지금은 손 선택을 사용할 수 없습니다.",
  HANDS_UNAVAILABLE: "손 모양을 적용하지 못했어요. 잠시 후 다시 시도해 주세요.",
  INVALID_HAND_PRESET: "손 모양을 다시 선택해 주세요.",
  HAND_LIBRARY_CHANGED: "손 목록이 변경되었습니다. 현재 손을 다시 확인해 주세요.",
  HANDS_CHANGED: "손 선택이 바뀌었습니다. 최종 미리보기를 다시 확인해 주세요.",
  MANUAL_SELECTION_REQUIRED: "후보 화면에서 사용할 포즈를 선택하고 확인해 주세요.",
  MANUAL_REVIEW_REQUIRED: "저장 전 확인 화면에서 고른 포즈의 최종 결과를 확인해 주세요.",
  HAND_REVIEW_REQUIRED: "저장 전 확인 화면에서 손이 적용된 결과를 확인해 주세요.",
  SEMANTIC_UNAVAILABLE: "지금은 문장 검색을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  SEMANTIC_FAILED: "검색을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  SEMANTIC_CONTRACT: "검색 결과를 확인하지 못했습니다. 잠시 후 다시 검색해 주세요.",
  // 로그인
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 필요합니다. 메일함을 확인해 주세요.",
  INVALID_INPUT: "입력한 내용을 다시 확인해 주세요.",
  EMAIL_TAKEN: "이미 다른 방법으로 가입된 이메일입니다. 기존 방식으로 로그인해 주세요.",

  // 세션
  UNAUTHENTICATED: "로그인이 풀렸어요. 다시 로그인해 주세요.",
  INVALID_TOKEN: "로그인이 풀렸어요. 다시 로그인해 주세요.",

  // 소셜 로그인
  PROVIDER_UNAVAILABLE: "지금은 이 소셜 로그인을 사용할 수 없습니다.",
  OAUTH_FAILED: "소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  OAUTH_STATE_MISMATCH: "소셜 로그인이 만료되었습니다. 다시 시도해 주세요.",
  EMAIL_REQUIRED: "소셜 계정의 이메일 제공에 동의해야 로그인할 수 있습니다.",
  INVALID_CODE: "로그인 정보가 만료되었습니다. 다시 시도해 주세요.",

  // 사용량 제한(BFF docs/API.md 「사용량 제한」)
  // ⚠ 한도 숫자나 재시도 시각을 여기 넣지 않는다 — 요청마다 다르므로 서버가 준
  //   details로 quotaMessage가 뒤에 붙인다. 이 테이블은 코드→고정 문구 매핑이다.
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  // 설치별 한도는 **주 단위**다(BFF `WEEKLY_QUOTA_EXCEEDED`, KST 월요일 리셋).
  // 이전 서버가 보내던 일일 코드도 남겨 둔다 — 클라와 서버는 순차 배포라 둘이 섞이는 창이 생긴다.
  WEEKLY_QUOTA_EXCEEDED: "이번 주에 사용할 수 있는 분석 횟수를 모두 사용했습니다.",
  DAILY_QUOTA_EXCEEDED: "오늘 사용할 수 있는 분석 횟수를 모두 사용했습니다.",
  GLOBAL_QUOTA_EXCEEDED: "오늘 베타 전체 분석 한도에 도달했습니다.",
  CONCURRENCY_LIMIT: "이미 진행 중인 분석이 있습니다.",
  SERVICE_PAUSED: "지금은 분석을 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  PAYLOAD_TOO_LARGE: "이미지가 너무 큽니다. 20MB 이하로 줄여서 다시 시도해 주세요.",

  BODY_PREVIEW_STALE: "체형이나 포즈가 바뀌었어요. 저장 전 화면에서 다시 확인해 주세요.",
  BODY_REVIEW_REQUIRED: "저장 전 확인 화면에서 현재 체형의 결과를 확인해 주세요.",
  BODY_SELECTION_DISABLED: "지금은 체형 선택을 사용할 수 없습니다.",
  BODY_UNAVAILABLE: "선택한 체형을 사용할 수 없습니다. 후보 화면에서 다른 체형을 선택해 주세요.",
  BODY_SELECTION_CONFLICT: "다른 화면에서 체형을 변경했습니다. 현재 선택을 다시 확인해 주세요.",
  BODY_PREFERENCE_CONFLICT: "기본 설정이 변경되었습니다. 현재 값을 다시 확인해 주세요.",
  BODY_PREVIEW_UNSUPPORTED: "이 작업에서는 체형을 바꾼 모습을 미리 볼 수 없어요.",
  // 저장(export)
  POSE_UNAVAILABLE: "이 포즈는 더 이상 제공되지 않습니다. 다른 후보를 선택해 주세요.",
  INVALID_EXPORT: "이 작업에서 선택한 후보가 아닙니다. 후보 화면에서 다시 선택해 주세요.",
  EXPORT_FAILED: "포즈 파일을 서버에서 받아오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  // FBX 변환(BFF docs/API.md 「format=fbx」). 재시도가 통하는 실패와 아닌 실패를 나눈다.
  OUTPUT_SCOPE_CHANGED: "저장할 부분이 바뀌었어요. 후보 화면에서 다시 확인해 주세요.",
  PREVIEW_CHANGED: "포즈나 모델이 바뀌었습니다. 미리보기를 다시 확인한 뒤 저장해 주세요.",
  FBX_UNAVAILABLE: "지금은 포즈 파일을 만들 수 없어요. 잠시 후 다시 시도해 주세요.",
  CONVERTER_UNAVAILABLE: "지금은 포즈 파일을 만들 수 없어요. 잠시 후 다시 시도해 주세요.",
  CONVERTER_TIMEOUT: "FBX 변환이 시간 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.",
  CONVERTER_REJECTED: "이 포즈는 저장할 수 있는 파일로 만들지 못했어요. 다른 후보를 선택해 주세요.",
  CONVERTER_INTEGRITY:
    "선택한 포즈와 저장 파일이 같은지 확인하지 못했어요. 다른 포즈를 골라 보거나, 문제가 계속되면 문의해 주세요.",
  CONVERTER_FAILED: "FBX 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  // 모델(체형) 선택. 둘 다 재시도로 풀리지 않는다 — 다른 모델을 고르거나 기본 모델로 간다.
  INVALID_CHARACTER: "이 체형은 사용할 수 없어요. 체형 화면에서 다른 체형을 골라 주세요.",
  CHARACTER_UNAVAILABLE:
    "고른 체형을 지금은 사용할 수 없어요. 후보 화면에서 다른 체형을 고른 뒤 다시 확인해 주세요.",

  // 작업 기록
  JOB_IN_PROGRESS: "진행 중인 분석은 삭제할 수 없습니다. 끝난 뒤에 다시 시도해 주세요.",
  NOT_READY: "아직 분석 중이에요. 결과가 나올 때까지 잠시 기다려 주세요.",

  // 기타
  NOT_FOUND: "찾는 정보가 없어요. 이전 화면으로 돌아가 다시 선택해 주세요.",
};

const SERVER_ERROR = "서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
const FALLBACK = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 세션이 끝났음을 뜻하는 코드. 이 경우 화면은 로그인으로 돌아가야 한다. */
export function isSessionExpiredCode(code: string): boolean {
  return code === "UNAUTHENTICATED" || code === "INVALID_TOKEN";
}

/**
 * 코드와 HTTP 상태로 문구를 고른다. 모르는 코드라도 서버 원문으로 새지 않는다.
 * 5xx는 코드가 무엇이든 "서버 문제"로 묶는다 — 사용자가 할 수 있는 일이 같다.
 */
export function messageForCode(code: string, status?: number): string {
  const known = MESSAGES[code];
  if (known) return known;
  if (status !== undefined && status >= 500) return SERVER_ERROR;
  return FALLBACK;
}
