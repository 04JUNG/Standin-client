import { TOUR_ANCHOR_IDS, type TourAnchorId } from "@/shared/types/tour";

/**
 * 투어 앵커 표식. 기존 data-tauri-drag-region·data-window-mode와 같은 방식이다.
 *
 * JSX에 spread해서 쓴다: <div {...tourAnchor("home.dropzone")}>
 * 투어는 이 요소의 위치(rect)와 활성 여부만 읽는다 — 동작은 건드리지 않는다.
 */
export const TOUR_ANCHOR_ATTR = "data-tour";

export function tourAnchor(id: TourAnchorId): { "data-tour": TourAnchorId } {
  return { [TOUR_ANCHOR_ATTR]: id } as { "data-tour": TourAnchorId };
}

export function findTourAnchor(id: TourAnchorId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TOUR_ANCHOR_ATTR}="${id}"]`);
}

export function isTourAnchorId(value: unknown): value is TourAnchorId {
  return typeof value === "string" && (TOUR_ANCHOR_IDS as readonly string[]).includes(value);
}
