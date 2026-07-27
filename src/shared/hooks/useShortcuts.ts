import { useEffect, useRef } from "react";
import type { Accelerator, ShortcutDef, ShortcutId } from "@/shared/types/shortcuts";
import { hasNonShiftModifier, matchesAccelerator } from "@/shared/lib/accelerator";
import { isOverlayBlocking, isTypingTarget } from "@/shared/lib/keyboardTarget";
import { isMac } from "@/shared/lib/platform";
import { SHORTCUTS_BY_ID, resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";

/**
 * 화면별 단축키 등록(docs/07 §7).
 * CaptureOverlayPage의 인라인 keydown 핸들러를 일반화한 것이다.
 *
 * 핸들러 맵의 키는 shortcutRegistry에 있는 id여야 하고, accelerator는 store에서
 * 해석하므로 사용자가 재지정한 값이 자동으로 반영된다.
 */

export type ShortcutHandlers = Partial<
  Record<ShortcutId, ((e: KeyboardEvent) => void) | undefined>
>;

type Options = {
  /** false면 리스너를 붙이지 않는다(로딩·오류 화면 등). */
  enabled?: boolean;
  /** 모달 자신처럼 오버레이 위에서 동작해야 하는 경우 true. */
  ignoreOverlay?: boolean;
};

/**
 * 입력 중에도 동작해야 하는가.
 * 명시값이 없으면 "Shift 외 수정자 포함" 또는 Escape일 때만 허용한다 — 맨 글자 키가
 * 타이핑을 가로채지 않게 하는 것이 docs/07 §7의 요구사항이다.
 */
function allowedWhileTyping(def: ShortcutDef, accel: Accelerator): boolean {
  if (def.allowWhileTyping !== undefined) return def.allowWhileTyping;
  return hasNonShiftModifier(accel) || accel === "Escape";
}

export function useShortcuts(handlers: ShortcutHandlers, options: Options = {}): void {
  const { enabled = true, ignoreOverlay = false } = options;
  const bindings = useShortcutStore((s) => s.bindings);

  // 핸들러를 ref에 담아 최신값을 유지한다. 호출부가 useCallback으로 감쌀 필요가 없고
  // effect가 매 렌더 재등록되지 않는다.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return; // 누르고 있을 때의 자동 반복 무시
      if (e.isComposing) return; // 한글 IME 조합 중에는 개입하지 않는다
      if (!ignoreOverlay && isOverlayBlocking()) return;

      const typing = isTypingTarget(e.target);
      const mac = isMac();

      for (const key of Object.keys(handlersRef.current) as ShortcutId[]) {
        const handler = handlersRef.current[key];
        if (!handler) continue; // undefined = 이번 렌더에서는 비활성

        const def = SHORTCUTS_BY_ID[key];
        if (!def) continue;
        // 전역 scope는 네이티브가 담당한다. 웹뷰에서 또 처리하면 이중 발동한다.
        if (def.scope === "global") continue;

        const accel = resolveAccelerator(key, bindings);
        if (!accel) continue;
        if (!matchesAccelerator(e, accel, mac)) continue;
        if (typing && !allowedWhileTyping(def, accel)) continue;

        // 웹뷰 기본 동작(Ctrl+S 저장 대화상자, Ctrl+O 파일 열기)을 차단한다.
        // stopPropagation은 하지 않는다 — DropZone의 로컬 핸들러와 조합 가능하게.
        e.preventDefault();
        handler(e);
        return; // 첫 매치에서 종료
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings, enabled, ignoreOverlay]);
}

/** 단일 등록 편의 wrapper. */
export function useShortcut(
  id: ShortcutId,
  handler: (e: KeyboardEvent) => void,
  options?: Options,
): void {
  useShortcuts({ [id]: handler } as ShortcutHandlers, options);
}
