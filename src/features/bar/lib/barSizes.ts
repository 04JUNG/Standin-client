import type { WindowMode, WindowSize } from "../api/windowMode.contract";

/**
 * 바 모드의 하위 상태별 창 크기(docs/04 바 모드 규격).
 * 크기 표는 UI 관심사라 TS가 소유한다(CLAUDE.md §9). Rust는 받은 값을 적용만 한다.
 */
export type BarState = "collapsed" | "actions" | "progress" | "candidates" | "save";

export const BAR_SIZES: Record<BarState, WindowSize> = {
  /** 옮길 수 있는 원형 버튼. 기본 상태. */
  collapsed: { width: 56, height: 56 },
  // 헤더 33 + 패딩 12 + 버튼 38(단축키 칩 22px가 높이를 지배) + 테두리 2 = 85.
  // 실측으로 확인했다 — 72·84에서는 세로 스크롤바가 났다.
  /** 캡처 / 업로드 */
  actions: { width: 360, height: 88 },
  /** 분석 진행 상태 */
  progress: { width: 360, height: 96 },
  /** 후보 5개 비교·선택 */
  candidates: { width: 720, height: 460 },
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
