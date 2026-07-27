import { describe, expect, it } from "vitest";
import {
  acceleratorFromEvent,
  hasNonShiftModifier,
  type KeyEventLike,
  matchesAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  toDisplayKeys,
  toTauriAccelerator,
} from "./accelerator";

/** 기본이 모두 false인 이벤트를 만들어 테스트 의도만 덮어쓴다. */
function ev(partial: Partial<KeyEventLike> & { code: string }): KeyEventLike {
  return { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...partial };
}

describe("parseAccelerator", () => {
  it("수정자와 code를 분리한다", () => {
    expect(parseAccelerator("Mod+Shift+KeyS")).toEqual({
      mods: ["Mod", "Shift"],
      code: "KeyS",
    });
  });

  it("수정자 없는 단독 키도 허용한다", () => {
    expect(parseAccelerator("KeyR")).toEqual({ mods: [], code: "KeyR" });
    expect(parseAccelerator("Escape")).toEqual({ mods: [], code: "Escape" });
    expect(parseAccelerator("F12")).toEqual({ mods: [], code: "F12" });
  });

  it("수정자만 있으면 거부한다", () => {
    expect(parseAccelerator("Mod+Shift")).toBeNull();
  });

  it("중복 수정자를 거부한다", () => {
    expect(parseAccelerator("Mod+Mod+KeyS")).toBeNull();
  });

  it("key가 둘이면 거부한다", () => {
    expect(parseAccelerator("KeyA+KeyB")).toBeNull();
  });

  it("모르는 code를 거부한다(손상된 영속값 방어)", () => {
    expect(parseAccelerator("Mod+Bogus")).toBeNull();
    expect(parseAccelerator("")).toBeNull();
    expect(parseAccelerator("F99")).toBeNull();
  });
});

describe("normalizeAccelerator", () => {
  it("수정자 순서를 고정한다", () => {
    expect(normalizeAccelerator("Shift+Mod+KeyS")).toBe("Mod+Shift+KeyS");
    expect(normalizeAccelerator("Shift+Alt+Mod+KeyS")).toBe("Mod+Alt+Shift+KeyS");
  });

  it("같은 조합은 표기가 달라도 같은 값으로 수렴한다", () => {
    expect(normalizeAccelerator("Shift+Mod+KeyS")).toBe(normalizeAccelerator("Mod+Shift+KeyS"));
  });

  it("공백을 흡수한다", () => {
    expect(normalizeAccelerator(" Mod + Shift + KeyS ")).toBe("Mod+Shift+KeyS");
  });
});

describe("matchesAccelerator", () => {
  it("Windows에서 Mod를 ctrl로 해석한다", () => {
    expect(matchesAccelerator(ev({ code: "KeyS", ctrlKey: true }), "Mod+KeyS", false)).toBe(true);
    expect(matchesAccelerator(ev({ code: "KeyS", metaKey: true }), "Mod+KeyS", false)).toBe(false);
  });

  it("macOS에서 Mod를 meta로 해석한다", () => {
    expect(matchesAccelerator(ev({ code: "KeyS", metaKey: true }), "Mod+KeyS", true)).toBe(true);
    expect(matchesAccelerator(ev({ code: "KeyS", ctrlKey: true }), "Mod+KeyS", true)).toBe(false);
  });

  it("수정자가 더 눌려 있으면 일치하지 않는다", () => {
    // 이것이 이 함수의 핵심 계약이다: Ctrl+Shift+S가 Ctrl+S를 발동시키면 안 된다.
    expect(
      matchesAccelerator(ev({ code: "KeyS", ctrlKey: true, shiftKey: true }), "Mod+KeyS", false),
    ).toBe(false);
  });

  it("수정자가 덜 눌려 있으면 일치하지 않는다", () => {
    expect(
      matchesAccelerator(ev({ code: "KeyS", ctrlKey: true }), "Mod+Shift+KeyS", false),
    ).toBe(false);
  });

  it("맨 키는 수정자가 하나도 없어야 일치한다", () => {
    expect(matchesAccelerator(ev({ code: "KeyR" }), "KeyR", false)).toBe(true);
    expect(matchesAccelerator(ev({ code: "KeyR", ctrlKey: true }), "KeyR", false)).toBe(false);
  });

  it("code가 다르면 일치하지 않는다", () => {
    expect(matchesAccelerator(ev({ code: "KeyA", ctrlKey: true }), "Mod+KeyS", false)).toBe(false);
  });

  it("파싱 불가한 accelerator는 일치하지 않는다", () => {
    expect(matchesAccelerator(ev({ code: "KeyS" }), "Mod+Bogus", false)).toBe(false);
  });
});

describe("acceleratorFromEvent", () => {
  it("눌린 조합을 정규 표기로 만든다", () => {
    expect(acceleratorFromEvent(ev({ code: "KeyS", ctrlKey: true, shiftKey: true }))).toBe(
      "Mod+Shift+KeyS",
    );
  });

  it("수정자 키 자체는 null(아직 확정 아님)", () => {
    expect(acceleratorFromEvent(ev({ code: "ShiftLeft", shiftKey: true }))).toBeNull();
    expect(acceleratorFromEvent(ev({ code: "ControlRight", ctrlKey: true }))).toBeNull();
  });

  it("ctrl과 meta를 모두 Mod로 접는다", () => {
    expect(acceleratorFromEvent(ev({ code: "KeyS", metaKey: true }))).toBe("Mod+KeyS");
    expect(acceleratorFromEvent(ev({ code: "KeyS", ctrlKey: true }))).toBe("Mod+KeyS");
  });

  it("모르는 code는 null", () => {
    expect(acceleratorFromEvent(ev({ code: "Bogus" }))).toBeNull();
  });

  it("왕복이 안정적이다", () => {
    const accel = acceleratorFromEvent(ev({ code: "Slash", shiftKey: true }));
    expect(accel).toBe("Shift+Slash");
    expect(matchesAccelerator(ev({ code: "Slash", shiftKey: true }), accel!, false)).toBe(true);
  });
});

describe("hasNonShiftModifier", () => {
  it("Shift만 있으면 false", () => {
    expect(hasNonShiftModifier("Shift+Slash")).toBe(false);
    expect(hasNonShiftModifier("KeyR")).toBe(false);
  });

  it("Mod·Alt가 있으면 true", () => {
    expect(hasNonShiftModifier("Mod+Shift+KeyS")).toBe(true);
    expect(hasNonShiftModifier("Alt+F4")).toBe(true);
  });
});

describe("toDisplayKeys", () => {
  it("Windows 라벨", () => {
    expect(toDisplayKeys("Mod+Shift+KeyS", false)).toEqual(["Ctrl", "Shift", "S"]);
  });

  it("macOS 기호", () => {
    expect(toDisplayKeys("Mod+Shift+KeyS", true)).toEqual(["⌘", "⇧", "S"]);
  });

  it("기호 키를 사람이 읽는 형태로 바꾼다", () => {
    expect(toDisplayKeys("Shift+Slash", false)).toEqual(["Shift", "/"]);
    expect(toDisplayKeys("Escape", false)).toEqual(["Esc"]);
    expect(toDisplayKeys("Mod+Enter", false)).toEqual(["Ctrl", "Enter"]);
  });

  it("수정자 순서는 표기 순서를 따른다", () => {
    expect(toDisplayKeys("Mod+Alt+Shift+KeyS", false)).toEqual(["Ctrl", "Alt", "Shift", "S"]);
  });

  it("파싱 불가면 빈 배열", () => {
    expect(toDisplayKeys("Mod+Bogus", false)).toEqual([]);
  });
});

describe("toTauriAccelerator", () => {
  it("Mod를 CmdOrCtrl로 바꾸고 code를 키 토큰으로 바꾼다", () => {
    expect(toTauriAccelerator("Mod+Shift+KeyS")).toBe("CmdOrCtrl+Shift+S");
    expect(toTauriAccelerator("Mod+Digit2")).toBe("CmdOrCtrl+2");
  });

  it("기호·특수 키를 변환표로 바꾼다", () => {
    expect(toTauriAccelerator("Shift+Slash")).toBe("Shift+/");
    expect(toTauriAccelerator("Mod+Enter")).toBe("CmdOrCtrl+Enter");
    expect(toTauriAccelerator("ArrowUp")).toBe("Up");
  });

  it("펑션 키는 그대로 통과", () => {
    expect(toTauriAccelerator("F12")).toBe("F12");
  });

  it("변환 불가면 null", () => {
    expect(toTauriAccelerator("Mod+Bogus")).toBeNull();
  });
});
