import { describe, expect, it } from "vitest";
import { formatJobDate } from "./formatJobDate";

describe("formatJobDate", () => {
  const now = new Date(2026, 7, 29, 14, 0);

  it("오늘은 시각만 남긴다", () => {
    expect(formatJobDate(new Date(2026, 7, 29, 9, 12).toISOString(), now)).toMatch(/^오늘 /);
  });

  it("어제는 어제로 읽는다", () => {
    expect(formatJobDate(new Date(2026, 7, 28, 22, 40).toISOString(), now)).toMatch(/^어제 /);
  });

  it("자정을 넘겼으면 24시간이 안 지나도 어제다", () => {
    // 달력 기준이라 오늘 01시에서 본 어제 23시는 두 시간 전이어도 "어제"다.
    const justAfterMidnight = new Date(2026, 7, 29, 1, 0);
    expect(formatJobDate(new Date(2026, 7, 28, 23, 0).toISOString(), justAfterMidnight)).toMatch(
      /^어제 /,
    );
  });

  it("그 이전은 날짜를 붙이고 같은 해에는 연도를 생략한다", () => {
    const formatted = formatJobDate(new Date(2026, 4, 2, 8, 0).toISOString(), now);
    expect(formatted).not.toMatch(/^(오늘|어제) /);
    expect(formatted).not.toContain("2026");
  });

  it("해가 다르면 연도를 붙인다", () => {
    expect(formatJobDate(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toContain("2025");
  });

  it("파싱할 수 없는 값은 빈 문자열이다", () => {
    expect(formatJobDate("not-a-date", now)).toBe("");
  });
});
