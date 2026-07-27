/**
 * 단축키가 물러나야 하는 상황 판정(docs/07 §7 "입력 필드 타이핑과 충돌하지 않음",
 * docs/04 §13 포커스 규칙).
 *
 * instanceof 대신 속성 검사로 구현해 jsdom 없이 테스트할 수 있게 한다.
 */

type TargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
} | null;

/** 텍스트를 입력하는 요소에 포커스가 있는가. */
export function isTypingTarget(target: unknown): boolean {
  const el = target as TargetLike;
  if (!el) return false;
  if (el.isContentEditable) return true;

  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

  return el.getAttribute?.("role") === "textbox";
}

/** Modal이 body에 세우는 표식. 모달이 열려 있으면 화면 단축키를 멈춘다. */
export const MODAL_OPEN_FLAG = "standinModalOpen";

/** 모달·오버레이가 떠 있어 화면 단축키가 물러나야 하는가. */
export function isOverlayBlocking(): boolean {
  if (typeof document === "undefined") return false;
  return document.body?.dataset?.[MODAL_OPEN_FLAG] === "true";
}
