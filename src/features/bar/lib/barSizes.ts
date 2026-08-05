import type { WindowMode, WindowSize } from "../api/windowMode.contract";

/**
 * 바 모드의 하위 상태별 창 크기(docs/04 바 모드 규격).
 * 크기 표는 UI 관심사라 TS가 소유한다(CLAUDE.md §9). Rust는 받은 값을 적용만 한다.
 */
export type BarState =
  | "collapsed"
  | "actions"
  | "progress"
  | "candidates"
  | "review"
  | "save";

export const BAR_SIZES: Record<BarState, WindowSize> = {
  /**
   * 옮길 수 있는 원형 버튼. 기본 상태.
   *
   * 창이 원과 같은 크기면 안티에일리어싱된 가장자리와 ring이 창 경계에서 잘려
   * 위아래 양옆이 깎여 보인다(실측). 창을 64로 두고 원은 4px 안쪽에 그린다.
   * 남는 4px 테두리는 투명해서 보이지 않는다.
   */
  collapsed: { width: 64, height: 64 },
  // 헤더 33 + 패딩 12 + 버튼 38(단축키 칩 22px가 높이를 지배) + 테두리 2 = 85.
  // 실측으로 확인했다 — 72·84에서는 세로 스크롤바가 났다.
  /** 캡처 / 업로드 */
  actions: { width: 360, height: 88 },
  /** 분석 진행 상태 */
  progress: { width: 360, height: 96 },
  /** 후보 5개 비교·선택 */
  candidates: { width: 720, height: 460 },
  /**
   * 저장 전 확인. 조정 진행 상태와 버튼 두 개뿐이라 progress와 비슷하게 작다.
   *
   * 이 항목이 없으면 barStateForPath가 null을 돌려주고 windowTargetForPath가 앱 모드
   * (1280×800)로 떨어진다 — 바에서 확인 화면에 들어가는 순간 창이 통째로 커진다.
   */
  review: { width: 360, height: 116 },
  /** 폴더·파일명·저장 */
  save: { width: 420, height: 300 },
};

export const APP_SIZE: WindowSize = { width: 1280, height: 800 };

/** 앱 모드 최소 크기(CLAUDE.md §11). Rust가 복원하는 값과 같아야 한다. */
export const APP_MIN_SIZE: WindowSize = { width: 960, height: 640 };

/** 경로 → 바 하위 상태. 바 라우트가 아니면 null. */
export function barStateForPath(pathname: string): BarState | null {
  if (pathname === "/bar") return "collapsed";
  if (pathname === "/bar/actions") return "actions";
  if (pathname === "/bar/progress") return "progress";
  if (pathname === "/bar/candidates") return "candidates";
  if (pathname === "/bar/review") return "review";
  if (pathname === "/bar/save") return "save";
  return null;
}

/**
 * 경로 → 창 모드와 크기.
 *
 * 모드의 진실 공급원을 라우트 하나로 둔다. 그래야 "창은 56×56인데 화면은 홈"
 * 같은 불일치가 구조적으로 생길 수 없다.
 */
export function windowTargetForPath(pathname: string): { mode: WindowMode; size: WindowSize } {
  const barState = barStateForPath(pathname);
  if (barState) return { mode: "bar", size: BAR_SIZES[barState] };
  // 캡처 영역 선택은 프리즈 프레임과 1:1로 맞아야 하므로 전체화면.
  if (pathname === "/app/capture") return { mode: "overlay", size: APP_SIZE };
  return { mode: "app", size: APP_SIZE };
}
