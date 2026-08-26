import { describe, expect, it } from "vitest";
import { joinQuotaMessage, limitHint, retryHint } from "./quotaMessage";

// KST 자정 = UTC 15:00. 서버는 `+09:00` 표기로 준다.
const KST_MIDNIGHT = "2026-08-15T00:00:00.000+09:00";

const HOUR = 60 * 60 * 1000;

/** 실행 머신의 시간대와 무관하게 "오늘/내일"을 만들기 위해 로컬 기준으로 시각을 만든다. */
function localMidnightTomorrow(now: Date): Date {
  const at = new Date(now);
  at.setHours(24, 0, 0, 0);
  return at;
}

describe("retryHint", () => {
  it("리셋이 로컬 기준 다음 날이면 내일로 안내한다", () => {
    // ⚠ 시간대를 고정하지 않는다 — CI는 UTC, 개발 머신은 KST라 절대 시각을 박으면
    //   같은 값이 한쪽에서는 오늘, 다른 쪽에서는 내일이 된다. 규칙 자체를 검증한다.
    const now = new Date("2026-08-14T04:00:00Z");
    const resetAt = localMidnightTomorrow(now);
    const seconds = Math.round((resetAt.getTime() - now.getTime()) / 1000);

    const hint = retryHint({ retryAfterSeconds: seconds, retryAt: resetAt.toISOString() }, now);

    expect(hint).toContain("다시 사용할 수 있습니다");
    expect(hint).toContain("내일");
  });

  // 주간 쿼터(BFF WEEKLY_QUOTA_EXCEEDED)는 최대 7일 뒤에 풀린다. 그걸 "내일"이라고 하면
  // 사용자는 하루 뒤에 다시 와서 또 막힌다.
  it("리셋이 며칠 뒤면 내일이 아니라 날짜로 안내한다", () => {
    const now = new Date("2026-08-22T04:00:00Z");
    const resetAt = new Date(now);
    resetAt.setHours(24 * 3, 0, 0, 0); // 로컬 기준 3일 뒤 자정

    const hint = retryHint(
      {
        retryAfterSeconds: Math.round((resetAt.getTime() - now.getTime()) / 1000),
        retryAt: resetAt.toISOString(),
      },
      now,
    );

    expect(hint).toContain("다시 사용할 수 있습니다");
    expect(hint).not.toContain("내일");
    // 날짜가 들어가야 언제 오면 되는지 알 수 있다(표기는 기기 로캘을 따른다).
    expect(hint).toMatch(/\d/);
  });

  it("리셋이 로컬 기준 오늘이면 시각만 안내한다", () => {
    const now = new Date("2026-08-14T04:00:00Z");
    const resetAt = new Date(Math.min(now.getTime() + 2 * HOUR, localMidnightTomorrow(now).getTime() - HOUR));
    const seconds = Math.round((resetAt.getTime() - now.getTime()) / 1000);

    const hint = retryHint({ retryAfterSeconds: seconds, retryAt: resetAt.toISOString() }, now);

    expect(hint).toContain("다시 사용할 수 있습니다");
    expect(hint).not.toContain("내일");
  });

  it("서버의 +09:00 표기를 그대로 받아 해석한다", () => {
    // 서버는 KST로 준다. 화면 표기는 기기 로컬이라 여기서는 파싱이 되는지만 본다.
    const now = new Date("2026-08-14T04:00:00Z");
    expect(retryHint({ retryAfterSeconds: 39600, retryAt: KST_MIDNIGHT }, now)).toContain(
      "다시 사용할 수 있습니다",
    );
  });

  it("창이 짧으면 절대 시각 대신 잠시 후로 안내한다", () => {
    // 동시 분석 제한은 10초다. "0시 0분부터"라고 쓰면 어색하다.
    expect(retryHint({ retryAfterSeconds: 10, limit: 1 })).toBe("잠시 후 다시 시도해 주세요.");
  });

  it("retryAt이 없으면 남은 초로 안내한다", () => {
    expect(retryHint({ retryAfterSeconds: 1800 })).toBe("약 30분 후에 다시 시도해 주세요.");
  });

  it("정보가 없거나 깨졌으면 아무것도 붙이지 않는다", () => {
    expect(retryHint(null)).toBeNull();
    expect(retryHint({})).toBeNull();
    expect(retryHint({ retryAt: "not-a-date" })).toBeNull();
  });
});

describe("limitHint", () => {
  it("서버가 준 한도만 보여준다", () => {
    expect(limitHint({ limit: 10 })).toBe("한도는 10회입니다.");
  });

  it("한도가 없으면 숫자를 지어내지 않는다", () => {
    expect(limitHint({})).toBeNull();
    expect(limitHint({ limit: 0 })).toBeNull();
    expect(limitHint(null)).toBeNull();
  });
});

describe("joinQuotaMessage", () => {
  it("고정 문구 + 한도 + 시점을 한 덩어리로 잇는다", () => {
    const now = new Date("2026-08-14T04:00:00Z");
    const resetAt = localMidnightTomorrow(now);
    const message = joinQuotaMessage(
      "오늘 사용할 수 있는 분석 횟수를 모두 사용했습니다.",
      {
        limit: 10,
        retryAfterSeconds: Math.round((resetAt.getTime() - now.getTime()) / 1000),
        retryAt: resetAt.toISOString(),
      },
      now,
    );

    expect(message).toContain("모두 사용했습니다.");
    expect(message).toContain("한도는 10회입니다.");
    expect(message).toContain("다시 사용할 수 있습니다");
  });

  it("붙일 정보가 없으면 고정 문구만 남는다", () => {
    expect(joinQuotaMessage("요청이 많습니다.", null)).toBe("요청이 많습니다.");
  });
});
