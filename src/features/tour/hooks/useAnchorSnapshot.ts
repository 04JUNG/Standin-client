import { useEffect, useState } from "react";
import { TOUR_ANCHOR_ATTR } from "@/shared/lib/tourAnchor";
import { TOUR_ANCHOR_IDS, type TourAnchorId } from "@/shared/types/tour";

export type Box = { top: number; left: number; width: number; height: number };

export type AnchorInfo = {
  /**
   * 화면에 실제로 보이는 부분. 스크롤 컨테이너 밖으로 나간 부분은 잘라낸다.
   * 전부 잘려 나갔으면 null — 강조할 자리가 없다는 뜻이다.
   */
  visible: Box | null;
  /** 지금 누를 수 있는 상태인가. 같은 id가 여럿이면 하나라도 누를 수 있으면 true. */
  enabled: boolean;
};

export type AnchorSnapshot = Map<TourAnchorId, AnchorInfo>;

const EMPTY: AnchorSnapshot = new Map();

type Edges = { top: number; left: number; right: number; bottom: number };

/**
 * 이 요소가 실제로 보일 수 있는 범위.
 *
 * 스크롤 컨테이너 안에서 위아래가 잘린 요소는 rect가 컨테이너 밖까지 뻗는다. 그대로
 * 강조하면 상단 앱 바나 업데이트 배너 위에 테두리가 얹힌다(실측). 조상 중 스크롤·클립
 * 컨테이너를 모두 만나 교집합을 구한다.
 */
function clipEdges(el: HTMLElement): Edges {
  let edges: Edges = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    // overflow 단축 속성도 함께 본다 — 축별 속성으로 펼쳐 주지 않는 환경이 있다.
    if (/(auto|scroll|hidden)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)) {
      const r = node.getBoundingClientRect();
      edges = {
        top: Math.max(edges.top, r.top),
        left: Math.max(edges.left, r.left),
        right: Math.min(edges.right, r.right),
        bottom: Math.min(edges.bottom, r.bottom),
      };
    }
    node = node.parentElement;
  }
  return edges;
}

function visibleBox(el: HTMLElement): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const c = clipEdges(el);
  const top = Math.max(r.top, c.top);
  const left = Math.max(r.left, c.left);
  const bottom = Math.min(r.bottom, c.bottom);
  const right = Math.min(r.right, c.right);
  if (bottom - top <= 0 || right - left <= 0) return null;
  return { top, left, width: right - left, height: bottom - top };
}

function merge(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  const right = Math.max(a.left + a.width, b.left + b.width);
  return { top, left, width: right - left, height: bottom - top };
}

function readAnchors(): AnchorSnapshot {
  const snapshot: AnchorSnapshot = new Map();
  for (const id of TOUR_ANCHOR_IDS) {
    // 같은 앵커가 여럿일 수 있다 — 후보 그리드는 인물마다 하나씩 나온다. 첫 요소만 보면
    // 나머지 인물의 후보를 강조하지 못한다.
    const els = document.querySelectorAll<HTMLElement>(`[${TOUR_ANCHOR_ATTR}="${id}"]`);
    if (els.length === 0) continue;

    let visible: Box | null = null;
    let enabled = false;
    for (const el of els) {
      visible = merge(visible, visibleBox(el));
      const disabled =
        (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
      if (!disabled) enabled = true;
    }
    // 요소가 DOM에 있으면 스크롤 밖이어도 '있는' 것으로 둔다. 스텝 판정이 스크롤 위치에
    // 흔들리면 안 된다 — 잘라낸 결과는 그리기에만 쓴다.
    snapshot.set(id, { visible, enabled });
  }
  return snapshot;
}

function signature(snapshot: AnchorSnapshot): string {
  let out = "";
  for (const [id, info] of snapshot) {
    const b = info.visible;
    // 소수점 아래는 버린다. 폰트 로딩 등으로 미세하게 흔들려도 렌더를 다시 하지 않는다.
    out += b
      ? `${id}:${Math.round(b.top)},${Math.round(b.left)},${Math.round(b.width)},${Math.round(
          b.height,
        )},${info.enabled ? 1 : 0}|`
      : `${id}:-,${info.enabled ? 1 : 0}|`;
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
      const nextSignature = signature(next);
      if (nextSignature !== previous) {
        previous = nextSignature;
        setSnapshot(next);
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return snapshot;
}
