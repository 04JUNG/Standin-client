import { beforeEach, describe, expect, it } from "vitest";
import { migrateShortcuts, sanitizeBindings, useShortcutStore } from "./shortcutStore";
import { DEFAULT_BINDINGS } from "@/shared/lib/shortcutRegistry";

describe("sanitizeBindings", () => {
  it("정상 바인딩을 통과시킨다", () => {
    expect(sanitizeBindings({ bindings: { "capture.start": "Mod+Alt+KeyK" } })).toEqual({
      "capture.start": "Mod+Alt+KeyK",
    });
  });

  it("표기가 흐트러진 값을 정규화한다", () => {
    expect(sanitizeBindings({ bindings: { "capture.start": "Shift+Mod+KeyK" } })).toEqual({
      "capture.start": "Mod+Shift+KeyK",
    });
  });

  it("레지스트리에 없는 id를 버린다", () => {
    expect(sanitizeBindings({ bindings: { "bogus.id": "Mod+KeyK" } })).toEqual({});
  });

  it("파싱 불가한 accelerator를 버린다", () => {
    expect(sanitizeBindings({ bindings: { "capture.start": "Mod+Bogus" } })).toEqual({});
  });

  it("문자열이 아닌 값을 버린다", () => {
    expect(sanitizeBindings({ bindings: { "capture.start": 42 } })).toEqual({});
  });

  it("손상된 입력을 안전하게 처리한다", () => {
    expect(sanitizeBindings(null)).toEqual({});
    expect(sanitizeBindings(undefined)).toEqual({});
    expect(sanitizeBindings({})).toEqual({});
    expect(sanitizeBindings({ bindings: "not an object" })).toEqual({});
    expect(sanitizeBindings("garbage")).toEqual({});
  });
});

describe("migrateShortcuts (v1 → v2)", () => {
  it("v1 기본값을 쓰던 사용자는 항목을 지워 새 기본값을 받게 한다", () => {
    const out = migrateShortcuts({ bindings: { "capture.start": "Mod+Shift+KeyS" } }, 1) as {
      bindings: Record<string, unknown>;
    };
    expect(out.bindings).not.toHaveProperty("capture.start");
  });

  it("사용자가 직접 지정한 키는 그대로 둔다", () => {
    const out = migrateShortcuts({ bindings: { "capture.start": "Mod+Shift+KeyK" } }, 1) as {
      bindings: Record<string, unknown>;
    };
    expect(out.bindings["capture.start"]).toBe("Mod+Shift+KeyK");
  });

  it("다른 항목은 건드리지 않는다", () => {
    const out = migrateShortcuts(
      { bindings: { "capture.start": "Mod+Shift+KeyS", "app.toggleCheatSheet": "Shift+Slash" } },
      1,
    ) as { bindings: Record<string, unknown> };
    expect(out.bindings["app.toggleCheatSheet"]).toBe("Shift+Slash");
  });

  it("v2 이상은 그대로 통과시킨다", () => {
    const persisted = { bindings: { "capture.start": "Mod+Shift+KeyS" } };
    expect(migrateShortcuts(persisted, 2)).toBe(persisted);
  });

  it("손상된 입력을 안전하게 처리한다", () => {
    expect(migrateShortcuts(null, 1)).toBeNull();
    expect(migrateShortcuts({ bindings: "garbage" }, 1)).toEqual({ bindings: "garbage" });
  });
});

describe("전역 캡처 기본값", () => {
  it("클립스튜디오 '다른 이름으로 저장'(Ctrl+Shift+S)과 충돌하지 않는다", () => {
    expect(DEFAULT_BINDINGS["capture.start"]).not.toBe("Mod+Shift+KeyS");
  });

  it("앱 내 대체 경로가 전역 키를 그대로 따른다", () => {
    expect(DEFAULT_BINDINGS["home.startCapture"]).toBe(DEFAULT_BINDINGS["capture.start"]);
  });
});

describe("useShortcutStore", () => {
  beforeEach(() => {
    useShortcutStore.getState().reset();
  });

  it("기본값으로 시작한다", () => {
    expect(useShortcutStore.getState().bindings).toEqual(DEFAULT_BINDINGS);
  });

  it("전역 바인딩을 바꾸고 직전 값을 보관한다", () => {
    const before = useShortcutStore.getState().bindings["capture.start"];
    useShortcutStore.getState().setBinding("capture.start", "Mod+Alt+KeyK");
    expect(useShortcutStore.getState().bindings["capture.start"]).toBe("Mod+Alt+KeyK");
    expect(useShortcutStore.getState().previousGlobal).toBe(before);
  });

  it("표기를 정규화해 저장한다", () => {
    useShortcutStore.getState().setBinding("capture.start", "Shift+Mod+KeyK");
    expect(useShortcutStore.getState().bindings["capture.start"]).toBe("Mod+Shift+KeyK");
  });

  it("파싱 불가한 값은 무시한다", () => {
    const before = useShortcutStore.getState().bindings["capture.start"];
    useShortcutStore.getState().setBinding("capture.start", "Mod+Bogus");
    expect(useShortcutStore.getState().bindings["capture.start"]).toBe(before);
  });

  it("별칭(mirrorOf) 항목은 직접 지정할 수 없다", () => {
    const before = useShortcutStore.getState().bindings["home.startCapture"];
    useShortcutStore.getState().setBinding("home.startCapture", "Mod+Alt+KeyJ");
    expect(useShortcutStore.getState().bindings["home.startCapture"]).toBe(before);
  });

  it("되돌리기가 직전 전역 값을 복원한다", () => {
    useShortcutStore.getState().setBinding("capture.start", "Mod+Alt+KeyK");
    useShortcutStore.getState().revertGlobal();
    expect(useShortcutStore.getState().bindings["capture.start"]).toBe(
      DEFAULT_BINDINGS["capture.start"],
    );
  });

  it("되돌릴 값이 없으면 아무 일도 하지 않는다", () => {
    useShortcutStore.getState().revertGlobal();
    expect(useShortcutStore.getState().bindings).toEqual(DEFAULT_BINDINGS);
  });

  it("기본값 복원이 동작한다", () => {
    useShortcutStore.getState().setBinding("capture.start", "Mod+Alt+KeyK");
    useShortcutStore.getState().resetBinding("capture.start");
    expect(useShortcutStore.getState().bindings["capture.start"]).toBe(
      DEFAULT_BINDINGS["capture.start"],
    );
  });

  it("치트시트 토글이 동작한다", () => {
    expect(useShortcutStore.getState().cheatSheetOpen).toBe(false);
    useShortcutStore.getState().toggleCheatSheet();
    expect(useShortcutStore.getState().cheatSheetOpen).toBe(true);
    useShortcutStore.getState().closeCheatSheet();
    expect(useShortcutStore.getState().cheatSheetOpen).toBe(false);
  });

  it("등록 상태와 오류를 기록한다", () => {
    useShortcutStore.getState().setGlobalStatus("failed", "이미 사용 중입니다.");
    expect(useShortcutStore.getState().globalStatus).toBe("failed");
    expect(useShortcutStore.getState().globalError).toBe("이미 사용 중입니다.");
    useShortcutStore.getState().setGlobalStatus("registered");
    expect(useShortcutStore.getState().globalError).toBeNull();
  });
});
