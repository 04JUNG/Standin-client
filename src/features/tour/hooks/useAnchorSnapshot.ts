import { useEffect, useState } from "react";
import { TOUR_ANCHOR_ATTR } from "@/shared/lib/tourAnchor";
import { TOUR_ANCHOR_IDS, type TourAnchorId } from "@/shared/types/tour";

export type Box = { top: number; left: number; width: number; height: number };

export type AnchorInfo = {
  /**
   * 화면에 실제로 보이는 부분. 스크롤 컨테이너 밖으로 나간 부분은 잘라낸다.
   * 지금 강조 중인 앵커에만 채운다 — 나머지는 위치를 알 필요가 없다.
   */
  visible: Box | null;
  /** 지금 누를 수 있는 상태인가. 같은 id가 여럿이면 하나라도 누를 수 있으면 true. */
  enabled: boolean;
};

export type AnchorSnapshot = Map<TourAnchorId, AnchorInfo>;

const EMPTY: AnchorSnapshot = new Map();

/**
 * 위치를 다시 재는 주기(ms).
 *
 * 매 프레임 재면 안 된다. 아래 계산은 강제 레이아웃(getBoundingClientRect)과 스타일
 * 재계산(getComputedStyle)을 부르는데, 인물이 여럿인 후보 화면에서는 앵커가 여럿이라
 * 프레임마다 수십 번이 된다. 렌더러 스레드가 포화돼 클릭이 아예 먹지 않는다(실측).
 * 오버레이 하나 따라가는 데 60fps가 필요하지도 않다.
 */
const INTERVAL_MS = 60;

type Edges = { top: number; left: number; right: number; bottom: number };

/**
 * 이 요소를 잘라낼 수 있는 조상들.
 *
 * getComputedStyle이 비싸므로 요소마다 한 번만 구하고 캐시한다. 앵커 요소는 다시
 * 그려질 때 새 노드가 되므로 캐시가 낡을 일이 없다(WeakMap이라 같이 사라진다).
 */
const clipAncestors = new WeakMap<HTMLElement, HTMLElement[]>();

function scrollAncestorsOf(el: HTMLElement): HTMLElement[] {
  const cached = clipAncestors.get(el);
  if (cached) return cached;

  const found: HTMLElement[] = [];
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    // overflow 단축 속성도 함께 본다 — 축별 속성으로 펼쳐 주지 않는 환경이 있다.
    if (/(auto|scroll|hidden)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)) {
      found.push(node);
    }
    node = node.parentElement;
  }
  clipAncestors.set(el, found);
  return found;
}

/**
 * 스크롤 컨테이너 안에서 위아래가 잘린 요소는 rect가 컨테이너 밖까지 뻗는다. 그대로
 * 강조하면 상단 앱 바나 업데이트 배너 위에 테두리가 얹힌다(실측).
 */
function clipEdges(el: HTMLElement): Edges {
  let edges: Edges = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (const node of scrollAncestorsOf(el)) {
    const r = node.getBoundingClientRect();
    edges = {
      top: Math.max(edges.top, r.top),
      left: Math.max(edges.left, r.left),
      right: Math.min(edges.right, r.right),
      bottom: Math.min(edges.bottom, r.bottom),
    };
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

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

function readAnchors(measure: ReadonlySet<TourAnchorId>): AnchorSnapshot {
  const snapshot: AnchorSnapshot = new Map();
  for (const id of TOUR_ANCHOR_IDS) {
    // 같은 앵커가 여럿일 수 있다 — 후보 그리드는 인물마다 하나씩 나온다.
    const els = document.querySelectorAll<HTMLElement>(`[${TOUR_ANCHOR_ATTR}="${id}"]`);
    if (els.length === 0) continue;

    let enabled = false;
    for (const el of els) if (!isDisabled(el)) enabled = true;

    // 위치는 지금 강조 중인 앵커만 잰다. 나머지는 "있는지"만 알면 스텝을 고를 수 있다.
    let visible: Box | null = null;
    if (measure.has(id)) {
      for (const el of els) visible = merge(visible, visibleBox(el));
    }
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
 * 앵커들의 존재·활성 상태와, 지금 강조 중인 앵커의 위치를 주기적으로 읽는다.
 *
 * MutationObserver + ResizeObserver + scroll·resize 리스너를 조합하는 대신 주기적으로
 * 다시 읽는 이유: 앵커가 사라지고 나타나는 것(로딩 → 후보), 안쪽 스크롤 컨테이너(main이
 * overflow-auto다), 배너가 밀어내는 레이아웃 변화를 한 번에 따라잡는다. 값이 실제로
 * 바뀔 때만 setState하므로 렌더는 변화가 있을 때만 일어난다.
 *
 * measure에는 활성 스텝의 앵커만 넘긴다. 활성 스텝은 직전 스냅샷에서 나오므로 한 번의
 * 주기만큼 늦게 반영되지만, 60ms라 눈에 보이지 않는다.
 */
export function useAnchorSnapshot(
  active: boolean,
  measure: readonly TourAnchorId[],
): AnchorSnapshot {
  const [snapshot, setSnapshot] = useState<AnchorSnapshot>(EMPTY);
  // 배열 그대로를 의존성에 넣으면 렌더마다 새 참조라 effect가 매번 다시 걸린다.
  const measureKey = measure.join(",");

  useEffect(() => {
    if (!active) {
      setSnapshot(EMPTY);
      return;
    }

    const wanted = new Set(measureKey ? (measureKey.split(",") as TourAnchorId[]) : []);
    let previous = "";

    function tick() {
      const next = readAnchors(wanted);
      const nextSignature = signature(next);
      if (nextSignature !== previous) {
        previous = nextSignature;
        setSnapshot(next);
      }
    }

    tick();
    const timer = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, measureKey]);

  return snapshot;
}
