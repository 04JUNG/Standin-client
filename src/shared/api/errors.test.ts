import { describe, expect, it, vi } from "vitest";
import { ApiError, messageOf, networkError, toAppError } from "./errors";
import { messageForCode } from "./errorMessages";

describe("toAppError", () => {
  it("서버 message를 절대 사용자 문구로 쓰지 않는다", () => {
    // docs/06 §4 — 서버 원문은 영어이거나 기술적이고, 계정 존재 여부를 흘릴 수 있다.
    const err = new ApiError(401, "INVALID_CREDENTIALS", "no user row for email a@b.com");

    const appError = toAppError(err);

    expect(appError.message).toBe("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(appError.message).not.toContain("a@b.com");
  });

  it("401·403은 재시도해도 소용없는 auth 오류로 만든다", () => {
    expect(toAppError(new ApiError(401, "INVALID_TOKEN", "x"))).toMatchObject({
      kind: "auth",
      retryable: false,
    });
    expect(toAppError(new ApiError(403, "EMAIL_NOT_VERIFIED", "x"))).toMatchObject({
      kind: "auth",
    });
  });

  it("5xx는 재시도 가능으로 표시한다", () => {
    expect(toAppError(new ApiError(503, "UNAVAILABLE", "x"))).toMatchObject({ retryable: true });
  });

  it("requestId는 화면이 아니라 로그로만 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const appError = toAppError(new ApiError(500, "INTERNAL", "stack trace", "req_42"));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("req_42"));
    expect(appError.message).not.toContain("req_42");
    warn.mockRestore();
  });

  it("이미 정규화된 오류는 그대로 통과시킨다", () => {
    const err = networkError();
    expect(toAppError(err)).toBe(err);
  });

  it("예상 못 한 값도 앱 문구로 바꾼다", () => {
    // zod 파싱 실패나 TypeError가 그대로 화면에 찍히면 안 된다.
    expect(toAppError(new TypeError("x.y is not a function")).message).toBe(
      "요청을 처리하지 못했습니다.",
    );
    expect(toAppError("문자열").message).toBe("요청을 처리하지 못했습니다.");
  });
});

describe("messageForCode", () => {
  it("모르는 코드도 서버 문구로 새지 않는다", () => {
    expect(messageForCode("SOME_NEW_CODE", 400)).toBe(
      "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("모르는 코드라도 5xx면 서버 문제로 안내한다", () => {
    expect(messageForCode("SOME_NEW_CODE", 502)).toBe(
      "서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});

describe("messageOf", () => {
  it("ApiError를 넘겨도 서버 원문이 나오지 않는다", () => {
    // 후보 화면들이 `error instanceof Error ? error.message : …`로 서버 원문을 그대로
    // 찍고 있었다. ApiError는 Error를 상속하므로 그 분기를 통과해 버린다.
    const err = new ApiError(429, "DAILY_QUOTA_EXCEEDED", "daily quota exceeded for inst_x");

    const shown = messageOf(err, "후보를 불러오지 못했습니다.");

    expect(shown).not.toContain("inst_x");
    expect(shown).not.toBe(err.message);
  });

  it("정규화가 문구를 못 고르면 fallback을 쓴다", () => {
    expect(messageOf(new TypeError("x"), "후보를 불러오지 못했습니다.")).toBe(
      "요청을 처리하지 못했습니다.",
    );
  });
});
