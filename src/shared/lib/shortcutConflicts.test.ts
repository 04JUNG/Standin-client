import { describe, expect, it } from "vitest";
import { findConflict, scopesOverlap } from "./shortcutConflicts";
import { DEFAULT_BINDINGS } from "./shortcutRegistry";

describe("scopesOverlap", () => {
  it("같은 scope는 겹친다", () => {
    expect(scopesOverlap("save", "save")).toBe(true);
  });

  it("서로 다른 화면 scope는 겹치지 않는다", () => {
    expect(scopesOverlap("inputPreview", "poseViewer")).toBe(false);
    expect(scopesOverlap("home", "save")).toBe(false);
  });

  it("app과 global은 모든 화면과 겹친다", () => {
    expect(scopesOverlap("app", "save")).toBe(true);
    expect(scopesOverlap("save", "app")).toBe(true);
    expect(scopesOverlap("global", "home")).toBe(true);
    expect(scopesOverlap("home", "global")).toBe(true);
  });
});

describe("findConflict", () => {
  it("파싱 불가한 조합을 거부한다", () => {
    expect(findConflict("capture.start", "Mod+Bogus", DEFAULT_BINDINGS)?.kind).toBe("unparsable");
  });

  it("예약 키를 거부한다", () => {
    expect(findConflict("capture.start", "Mod+KeyR", DEFAULT_BINDINGS)?.kind).toBe("reserved");
    expect(findConflict("capture.start", "F12", DEFAULT_BINDINGS)?.kind).toBe("reserved");
  });

  it("정규화 전 표기로 들어온 예약 키도 잡는다", () => {
    expect(findConflict("capture.start", "KeyR+Mod", DEFAULT_BINDINGS)?.kind).toBe("reserved");
  });

  it("전역 단축키에 맨 키를 거부한다", () => {
    // 맨 키를 전역으로 잡으면 모든 프로그램의 타이핑을 삼킨다.
    const conflict = findConflict("capture.start", "KeyJ", DEFAULT_BINDINGS);
    expect(conflict?.kind).toBe("needsModifier");
  });

  it("전역 단축키에 Shift 단독도 거부한다", () => {
    expect(findConflict("capture.start", "Shift+KeyJ", DEFAULT_BINDINGS)?.kind).toBe(
      "needsModifier",
    );
  });

  it("겹치는 scope의 중복을 잡는다", () => {
    // app scope인 치트시트 키를 전역에 지정하려 하면 충돌이다.
    const conflict = findConflict("capture.start", "Shift+Slash", DEFAULT_BINDINGS);
    expect(conflict?.kind).toBe("needsModifier"); // 수정자 규칙이 먼저 걸린다
  });

  it("app scope 키와의 중복을 잡는다", () => {
    const bindings = { ...DEFAULT_BINDINGS, "app.toggleCheatSheet": "Mod+Alt+KeyK" };
    const conflict = findConflict("capture.start", "Mod+Alt+KeyK", bindings);
    expect(conflict?.kind).toBe("duplicate");
    expect(conflict?.withId).toBe("app.toggleCheatSheet");
  });

  it("겹치지 않는 화면 scope는 같은 키를 써도 충돌이 아니다", () => {
    // Mod+Enter는 분석 시작(inputPreview)과 포즈 사용(poseViewer)이 함께 쓴다.
    // 두 화면은 동시에 떠 있지 않으므로 정상이다.
    expect(findConflict("inputPreview.startAnalysis", "Mod+Enter", DEFAULT_BINDINGS)).toBeNull();
    expect(findConflict("poseViewer.confirm", "Mod+Enter", DEFAULT_BINDINGS)).toBeNull();
  });

  it("자기 자신과는 충돌하지 않는다", () => {
    expect(findConflict("capture.start", "Mod+Shift+KeyS", DEFAULT_BINDINGS)).toBeNull();
  });

  it("mirrorOf 항목과는 충돌하지 않는다", () => {
    // home.startCapture는 capture.start의 별칭이라 같은 키를 갖는 게 정상이다.
    expect(findConflict("capture.start", "Mod+Shift+KeyS", DEFAULT_BINDINGS)).toBeNull();
  });

  it("모르는 id를 거부한다", () => {
    // 손상된 영속값이 흘러 들어오는 경로 방어.
    // @ts-expect-error 의도적으로 잘못된 id
    expect(findConflict("nope", "Mod+Alt+KeyK", DEFAULT_BINDINGS)?.kind).toBe("unparsable");
  });

  it("유효한 새 전역 키는 통과한다", () => {
    expect(findConflict("capture.start", "Mod+Alt+KeyK", DEFAULT_BINDINGS)).toBeNull();
  });
});
