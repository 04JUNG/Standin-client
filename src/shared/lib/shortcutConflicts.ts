import type { Accelerator, ShortcutId, ShortcutScope } from "@/shared/types/shortcuts";
import { hasNonShiftModifier, normalizeAccelerator } from "./accelerator";
import { SHORTCUTS, SHORTCUTS_BY_ID, resolveAccelerator } from "./shortcutRegistry";

/**
 * 단축키 재지정 시의 충돌 검사(docs/07 §7 "충돌 시 등록 실패 안내").
 *
 * 여기서 잡는 것은 앱이 스스로 알 수 있는 충돌뿐이다. OS 수준 충돌은
 * 실제 등록을 시도해야만 알 수 있으므로 네이티브 등록 실패로 처리한다.
 */

export type ConflictKind = "duplicate" | "reserved" | "needsModifier" | "unparsable";

export type Conflict = {
  kind: ConflictKind;
  /** duplicate일 때 충돌 상대. */
  withId?: ShortcutId;
  message: string;
};

/**
 * 앱이 절대 가져가지 않는 키. OS·웹뷰 기본 동작을 빼앗으면 복구가 어렵다.
 * 정규 표기로 적는다(형식이 틀리면 테스트가 잡는다).
 */
export const RESERVED_ACCELERATORS: readonly Accelerator[] = [
  // 입력 필드 편집
  "Mod+KeyC",
  "Mod+KeyV",
  "Mod+KeyX",
  "Mod+KeyA",
  "Mod+KeyZ",
  // 앱 종료·창 닫기
  "Mod+KeyQ",
  "Mod+KeyW",
  "Alt+F4",
  // 웹뷰 새로고침(개발 중 치명적)
  "Mod+KeyR",
  "F5",
  // 개발자 도구
  "F12",
  "Mod+Shift+KeyI",
  // macOS 숨기기·최소화
  "Mod+KeyH",
  "Mod+KeyM",
  // 접근성 활성화 키 — 단독으로 빼앗으면 키보드 조작이 깨진다
  "Escape",
  "Enter",
  "Tab",
  "Space",
];

const RESERVED_SET = new Set<string>(RESERVED_ACCELERATORS);

/**
 * scope가 겹치면 같은 키를 쓸 수 없다.
 * app/global은 모든 화면과 동시에 살아 있으므로 전부와 겹친다.
 *
 * 이 규칙 덕에 Mod+Enter를 inputPreview(분석 시작)와 poseViewer(포즈 사용)에서
 * 동시에 쓸 수 있다 — 두 화면은 함께 떠 있지 않기 때문이다.
 */
export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === "app" || b === "app" || a === "global" || b === "global";
}

export function findConflict(
  id: ShortcutId,
  next: Accelerator,
  bindings: Record<ShortcutId, Accelerator>,
): Conflict | null {
  const normalized = normalizeAccelerator(next);
  if (!normalized) {
    return { kind: "unparsable", message: "인식할 수 없는 키 조합입니다." };
  }

  const target = SHORTCUTS_BY_ID[id];
  if (!target) {
    return { kind: "unparsable", message: "알 수 없는 단축키입니다." };
  }

  // 예약 목록은 "사용자가 가져갈 수 없는 키"를 뜻한다. 앱이 직접 고른 기본값
  // (오버레이 취소의 Escape 등)은 의도된 선택이므로 대상이 아니다.
  if (target.customizable && RESERVED_SET.has(normalized)) {
    return {
      kind: "reserved",
      message: "시스템이 사용하는 키 조합이라 지정할 수 없습니다.",
    };
  }

  // 전역 단축키를 맨 키로 잡으면 모든 프로그램의 타이핑을 삼킨다.
  if (target.scope === "global" && !hasNonShiftModifier(normalized)) {
    return {
      kind: "needsModifier",
      message: "전역 단축키는 Ctrl·Alt·⌘ 중 하나를 포함해야 합니다.",
    };
  }

  for (const def of SHORTCUTS) {
    if (def.id === id) continue;
    // mirrorOf는 원본을 따라가는 별칭이라 충돌 대상이 아니다.
    if (def.mirrorOf) continue;
    if (!scopesOverlap(target.scope, def.scope)) continue;

    const current = resolveAccelerator(def.id, bindings);
    if (!current) continue;
    if (normalizeAccelerator(current) !== normalized) continue;

    return {
      kind: "duplicate",
      withId: def.id,
      message: `이미 "${def.label}"에 지정된 키 조합입니다.`,
    };
  }

  return null;
}
