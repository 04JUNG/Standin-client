import { describe, expect, it } from "vitest";
import { parseAccelerator } from "./accelerator";
import { RESERVED_ACCELERATORS, findConflict } from "./shortcutConflicts";
import {
  DEFAULT_BINDINGS,
  SCOPE_ORDER,
  SHORTCUTS,
  SHORTCUTS_BY_ID,
  listedShortcuts,
  resolveAccelerator,
} from "./shortcutRegistry";
import type { ShortcutId } from "@/shared/types/shortcuts";

/**
 * 레지스트리 불변식. 앞으로 항목을 추가할 때 이 테스트가 스스로를 감시한다.
 * 출하되는 기본값끼리 충돌하거나 예약 키를 침범하면 여기서 막힌다.
 */
describe("shortcutRegistry 불변식", () => {
  it("id가 중복되지 않는다", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 defaultAccelerator가 파싱된다", () => {
    for (const def of SHORTCUTS) {
      expect(parseAccelerator(def.defaultAccelerator), `${def.id}`).not.toBeNull();
    }
  });

  it("모든 defaultAccelerator가 이미 정규 표기다", () => {
    for (const def of SHORTCUTS) {
      const parsed = parseAccelerator(def.defaultAccelerator)!;
      const round = [...parsed.mods, parsed.code].join("+");
      expect(round, `${def.id}`).toBe(def.defaultAccelerator);
    }
  });

  it("모든 mirrorOf 대상이 존재한다", () => {
    for (const def of SHORTCUTS) {
      if (!def.mirrorOf) continue;
      expect(SHORTCUTS_BY_ID[def.mirrorOf], `${def.id} → ${def.mirrorOf}`).toBeDefined();
    }
  });

  it("mirrorOf는 원본과 같은 accelerator로 해석된다", () => {
    for (const def of SHORTCUTS) {
      if (!def.mirrorOf) continue;
      expect(resolveAccelerator(def.id, DEFAULT_BINDINGS)).toBe(
        resolveAccelerator(def.mirrorOf, DEFAULT_BINDINGS),
      );
    }
  });

  it("출하 기본값끼리 충돌하지 않는다", () => {
    for (const def of SHORTCUTS) {
      if (def.mirrorOf) continue;
      const conflict = findConflict(def.id, def.defaultAccelerator, DEFAULT_BINDINGS);
      expect(conflict, `${def.id}: ${conflict?.message}`).toBeNull();
    }
  });

  it("재지정 가능한 항목은 전역 단축키뿐이다", () => {
    // docs/07 §7 범위 결정. 앱 내 단축키는 고정하고 치트시트로만 노출한다.
    const customizable = SHORTCUTS.filter((s) => s.customizable).map((s) => s.id);
    expect(customizable).toEqual(["capture.start"]);
  });

  it("모든 scope가 SCOPE_ORDER에 있다", () => {
    for (const def of SHORTCUTS) {
      expect(SCOPE_ORDER, `${def.id}`).toContain(def.scope);
    }
  });

  it("SCOPE_ORDER 전체를 합치면 mirrorOf를 뺀 목록과 같다", () => {
    const listed = SCOPE_ORDER.flatMap((scope) => listedShortcuts(scope)).map((s) => s.id);
    const expected = SHORTCUTS.filter((s) => !s.mirrorOf).map((s) => s.id);
    expect(new Set(listed)).toEqual(new Set(expected));
  });

  it("예약 accelerator가 모두 정규 표기다", () => {
    for (const accel of RESERVED_ACCELERATORS) {
      const parsed = parseAccelerator(accel);
      expect(parsed, accel).not.toBeNull();
      expect([...parsed!.mods, parsed!.code].join("+"), accel).toBe(accel);
    }
  });

  it("재지정 가능한 항목은 예약 키를 기본값으로 쓰지 않는다", () => {
    // 예약 목록은 사용자 재지정을 막는 장치다. 앱이 직접 고른 기본값(Escape 등)은
    // 의도된 선택이지만, 재지정 가능한 항목이 예약 키를 쓰면 모순이다.
    const offenders = SHORTCUTS.filter(
      (s) => s.customizable && RESERVED_ACCELERATORS.includes(s.defaultAccelerator),
    ).map((s) => s.id);
    expect(offenders).toEqual([]);
  });

  it("예약 키를 기본값으로 쓰는 항목은 모두 재지정 불가다", () => {
    for (const def of SHORTCUTS) {
      if (!RESERVED_ACCELERATORS.includes(def.defaultAccelerator)) continue;
      expect(def.customizable, `${def.id}`).toBe(false);
    }
  });
});

describe("resolveAccelerator", () => {
  it("override가 있으면 그것을 쓴다", () => {
    const bindings = { ...DEFAULT_BINDINGS, "capture.start": "Mod+Alt+KeyK" };
    expect(resolveAccelerator("capture.start", bindings)).toBe("Mod+Alt+KeyK");
  });

  it("mirrorOf는 원본의 override를 따라간다", () => {
    const bindings = { ...DEFAULT_BINDINGS, "capture.start": "Mod+Alt+KeyK" };
    expect(resolveAccelerator("home.startCapture", bindings)).toBe("Mod+Alt+KeyK");
  });

  it("모르는 id는 undefined", () => {
    expect(resolveAccelerator("nope" as ShortcutId, DEFAULT_BINDINGS)).toBeUndefined();
  });
});
