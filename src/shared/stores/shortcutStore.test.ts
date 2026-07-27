import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeBindings, useShortcutStore } from "./shortcutStore";
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
