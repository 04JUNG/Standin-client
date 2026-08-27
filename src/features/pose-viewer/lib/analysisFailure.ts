import { messageOf, toAppError } from "@/shared/api/errors";
import { AnalysisError, type AnalysisErrorCode } from "../api/pose.contract";

/**
 * 분석 실패 하나를 화면이 필요로 하는 두 가지로 바꾼다 — **무엇을 보여줄지**와
 * **다시 시도 버튼을 줄지**.
 *
 * `messageOf`만으로는 부족하다. 그건 `ApiError`(서버 오류 봉투) 전용이라 `AnalysisError`가
 * 들어오면 코드를 모른 채 "요청을 처리하지 못했습니다."로 뭉갠다 — 실제로 "이미지에서
 * 인물을 찾지 못했습니다"·"분석 시간이 너무 오래 걸리고 있습니다" 같은 **앱이 직접 쓴 문구가
 * 전부 사라지고 있었다.** 그 문구들은 원인을 가장 정확히 설명하므로 그대로 쓴다.
 *
 * 재시도 가능 여부를 함께 내보내는 이유: "잠시 후 다시 시도해 주세요"라고 안내하면서
 * 다시 시도할 방법을 주지 않으면 안내가 빈말이 된다.
 */

/**
 * 같은 입력으로 다시 해 볼 만한 실패.
 *
 * - `UPSTREAM_UNAVAILABLE` — 상류 VLM 혼잡. 잠시 뒤면 풀린다.
 * - `TIMEOUT` — 오래 걸렸을 뿐 입력이 잘못된 것은 아니다.
 * - `ABANDONED` — 배포·태스크 교체로 Job이 유실됐다.
 *
 * `NO_PEOPLE`·`JOB_FAILED`는 뺀다 — 같은 이미지로 다시 해도 같은 결과다. 그때는 다른
 * 입력으로 가야 하므로 재시도 버튼이 오히려 사용자를 붙잡는다.
 */
const RETRYABLE_CODES = new Set<AnalysisErrorCode>([
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "ABANDONED",
]);

export type AnalysisFailure = {
  message: string;
  /** 같은 입력으로 다시 시도할 만한가. 화면이 "다시 시도" 버튼을 줄지 정한다. */
  retryable: boolean;
};

export function analysisFailure(error: unknown): AnalysisFailure {
  if (error instanceof AnalysisError) {
    // 앱이 직접 쓴 문구다. 코드로 다시 고르면 원인 설명만 흐려진다.
    return { message: error.message, retryable: RETRYABLE_CODES.has(error.code) };
  }
  // 서버 오류 봉투·네트워크 실패. 문구는 code로 고르고(서버 원문 노출 금지, docs/06 §4)
  // 사용량 제한이면 다음 사용 가능 시점까지 붙는다.
  const appError = toAppError(error);
  return {
    message: messageOf(error, "후보를 불러오지 못했습니다."),
    // validation 오류에는 retryable이 없다 — 입력을 고치기 전에는 다시 해도 같다.
    retryable: "retryable" in appError && appError.retryable,
  };
}
