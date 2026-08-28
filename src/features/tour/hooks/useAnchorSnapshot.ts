import { useEffect, useState } from "react";
import { TOUR_ANCHOR_ATTR } from "@/shared/lib/tourAnchor";
import { TOUR_ANCHOR_IDS, type TourAnchorId } from "@/shared/types/tour";

export type AnchorInfo = {
  /** 뷰포트 기준 위치. 오버레이가 fixed라 그대로 쓴다. */
  rect: { top: number; left: number; width: number; height: number };
  /** 지금 누를 수 있는 상태인가. */
  enabled: boolean;
};

export type AnchorSnapshot = Map<TourAnchorId, AnchorInfo>;

const EMPTY: AnchorSnapshot = new Map();

function readAnchors(): AnchorSnapshot {
  const snapshot: AnchorSnapshot = new Map();
  for (const id of TOUR_ANCHOR_IDS) {
    const el = document.querySelector<HTMLElement>(`[${TOUR_ANCHOR_ATTR}="${id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    // 크기가 0이면 화면에 없는 것으로 본다(조건부 렌더 직전·직후).
    if (rect.width <= 0 || rect.height <= 0) continue;
    const disabled =
      (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
    snapshot.set(id, {
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      enabled: !disabled,
    });
  }
  return snapshot;
}

function signature(snapshot: AnchorSnapshot): string {
  let out = "";
  for (const [id, info] of snapshot) {
    // 소수점 아래는 버린다. 폰트 로딩 등으로 미세하게 흔들려도 렌더를 다시 하지 않는다.
    out += `${id}:${Math.round(info.rect.top)},${Math.round(info.rect.left)},${Math.round(
      info.rect.width,
    )},${Math.round(info.rect.height)},${info.enabled ? 1 : 0}|`;
  }
  return out;
}

/**
 * 앵커들의 현재 위치·활성 상태를 매 프레임 읽는다.
 *
 * MutationObserver + ResizeObserver + scroll·resize 리스너를 조합하는 대신 rAF 한 줄을
 * 쓰는 이유: 앵커가 사라지고 나타나는 것(로딩 → 후보), 안쪽 스크롤 컨테이너(main이
 * overflow-auto다), 배너가 밀어내는 레이아웃 변화, 애니메이션을 한 번에 따라잡는다.
 * 값이 실제로 바뀔 때만 setState하므로 렌더는 변화가 있을 때만 일어나고, 이 루프는
 * 투어가 떠 있는 동안에만 돈다.
 */
export function useAnchorSnapshot(active: boolean): AnchorSnapshot {
  const [snapshot, setSnapshot] = useState<AnchorSnapshot>(EMPTY);

  useEffect(() => {
    if (!active) {
      setSnapshot(EMPTY);
      return;
    }

    let frame = 0;
    let previous = "";

    function tick() {
      const next = readAnchors();
      const next_signature = signature(next);
      if (next_signature !== previous) {
        previous = next_signature;
        setSnapshot(next);
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return snapshot;
}
