import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./keyboardTarget";

/** DOM 없이 duck typing으로 검사하므로 최소 형태만 만들어 넣는다. */
function el(tagName: string, extra: Record<string, unknown> = {}) {
  return { tagName, getAttribute: () => null, ...extra };
}

describe("isTypingTarget", () => {
  it("텍스트 입력 요소를 감지한다", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
  });

  it("소문자 tagName도 감지한다", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
  });

  it("contentEditable을 감지한다", () => {
    expect(isTypingTarget(el("DIV", { isContentEditable: true }))).toBe(true);
  });

  it('role="textbox"를 감지한다', () => {
    expect(
      isTypingTarget(el("DIV", { getAttribute: (n: string) => (n === "role" ? "textbox" : null) })),
    ).toBe(true);
  });

  it("일반 요소는 입력 대상이 아니다", () => {
    expect(isTypingTarget(el("DIV"))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("BODY"))).toBe(false);
  });

  it("null·undefined를 안전하게 처리한다", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });

  it("tagName이 없는 객체를 안전하게 처리한다", () => {
    expect(isTypingTarget({})).toBe(false);
  });
});
