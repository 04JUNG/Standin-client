import { describe, expect, it } from "vitest";
import { joinQuotaMessage, limitHint, retryHint } from "./quotaMessage";

// KST 자정 = UTC 15:00. 서버는 `+09:00` 표기로 준다.
const KST_MIDNIGHT = "2026-08-15T00:00:00.000+09:00";

describe("retryHint", () => {
  it("일일 쿼터는 다음 사용 가능 시각을 알려준다", () => {
    const now = new Date("2026-08-14T04:00:00Z"); // KST 8/14 13:00
    const hint = retryHint({ retryAfterSeconds: 39600, retryAt: KST_MIDNIGHT }, now);

    expect(hint).toContain("다시 사용할 수 있습니다");
    // 리셋이 사용자 로컬 기준 다음 날이면 "내일"을 붙인다.
    expect(hint).toContain("내일");
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
    const message = joinQuotaMessage(
      "오늘 사용할 수 있는 분석 횟수를 모두 사용했습니다.",
      { limit: 10, retryAfterSeconds: 39600, retryAt: KST_MIDNIGHT },
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
