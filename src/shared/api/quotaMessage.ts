/**
 * 사용량 제한 안내에 "언제 다시 쓸 수 있는지"를 붙이는 순수 함수들.
 *
 * 왜 `errorMessages.ts`에 넣지 않는가: 그 테이블은 코드→**고정** 문구 매핑이고,
 * 재시도 시각과 한도는 요청마다 서버가 다르게 준다. 고정 문구 뒤에 여기서 만든
 * 시점 문구를 이어 붙인다(`errors.ts`의 `messageOf`가 조립한다).
 *
 * 서버 계약: BFF `docs/API.md` 「사용량 제한」 — `details.retryAt`은 KST(`+09:00`)
 * 표기이고 `retryAfterSeconds`는 `Retry-After` 헤더와 같은 값이다.
 *
 * ⚠ 이 모듈은 `errors.ts`를 import하지 않는다(순환 방지). 평범한 데이터만 받는다.
 */

/**
 * 서버가 오류 봉투의 `details`에 실어 보내는 사용량 제한 정보.
 *
 * 한도 숫자를 클라에 하드코딩하지 않는다 — 서버 환경변수로 조정되므로 받은 값을 쓴다.
 */
export type LimitDetails = {
  /** 다시 시도할 수 있을 때까지 남은 초. `Retry-After` 헤더와 같다. */
  retryAfterSeconds?: number;
  /** 초과한 한도값. 예: 일일 10회 */
  limit?: number;
  /** 창이 리셋되는 시각(ISO, KST `+09:00`). 일일 쿼터에만 있다. */
  retryAt?: string;
  /** burst 제한의 창 길이(초). */
  windowSeconds?: number;
};

/** 절대 시각으로 안내할 기준. 이보다 짧으면 "잠시 후"가 더 자연스럽다. */
const ABSOLUTE_TIME_THRESHOLD_SECONDS = 5 * 60;

function formatClockTime(date: Date): string {
  // 사용자의 로컬 시간대로 보여준다 — 서버가 KST로 주더라도 화면은 기기 기준이어야 한다.
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** 자정 기준으로 며칠 뒤인가(같은 날 0, 다음 날 1). */
function localDaysAhead(target: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(target) - startOfDay(now)) / (24 * 60 * 60 * 1000));
}

/** "8월 24일 월요일". 주간 쿼터처럼 며칠 뒤에 풀리는 창을 안내할 때 쓴다. */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

/**
 * 재시도 시점 한 문장. 알 수 없으면 null(그때는 고정 문구만 보여준다).
 *
 * @param now 테스트에서 시각을 고정하기 위해 주입한다.
 */
export function retryHint(details: LimitDetails | null, now = new Date()): string | null {
  if (!details) return null;

  const seconds = details.retryAfterSeconds;
  const resetAt = details.retryAt ? new Date(details.retryAt) : null;
  const resetValid = resetAt !== null && !Number.isNaN(resetAt.getTime());

  if (!resetValid) {
    if (seconds === undefined) return null;
    // 동시 분석 제한처럼 창이 짧으면 시각을 못 박는 게 오히려 어색하다.
    return seconds <= ABSOLUTE_TIME_THRESHOLD_SECONDS
      ? "잠시 후 다시 시도해 주세요."
      : `약 ${Math.ceil(seconds / 60)}분 후에 다시 시도해 주세요.`;
  }

  if (seconds !== undefined && seconds <= ABSOLUTE_TIME_THRESHOLD_SECONDS) {
    return "잠시 후 다시 시도해 주세요.";
  }

  const clock = formatClockTime(resetAt);
  if (isSameLocalDay(resetAt, now)) return `${clock}부터 다시 사용할 수 있습니다.`;
  if (localDaysAhead(resetAt, now) === 1) return `내일 ${clock}부터 다시 사용할 수 있습니다.`;
  // 주간 쿼터는 최대 7일 뒤에 풀린다. 그걸 "내일"이라고 하면 사용자는 하루 뒤에 다시 와서
  // 또 막힌다. 며칠 뒤면 시각보다 날짜가 필요한 정보다.
  return `${formatDate(resetAt)}부터 다시 사용할 수 있습니다.`;
}

/** 한도를 알려주는 문장. 서버가 준 값만 쓴다. */
export function limitHint(details: LimitDetails | null): string | null {
  return typeof details?.limit === "number" && details.limit > 0
    ? `한도는 ${details.limit}회입니다.`
    : null;
}

/** 고정 문구 + 한도 + 재시도 시점을 한 덩어리로 잇는다. */
export function joinQuotaMessage(
  base: string,
  details: LimitDetails | null,
  now = new Date(),
): string {
  return [base, limitHint(details), retryHint(details, now)].filter(Boolean).join(" ");
}
