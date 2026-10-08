import type { WindowMode, WindowSize } from "../api/windowMode.contract";

/**
 * 바 모드의 하위 상태별 창 크기(docs/04 바 모드 규격).
 * 크기 표는 UI 관심사라 TS가 소유한다(CLAUDE.md §9). Rust는 받은 값을 적용만 한다.
 */
export type BarState = "collapsed" | "actions" | "progress" | "candidates" | "review" | "save";

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
  // 카드와 이름이 여러 줄일 때도 창 크기를 고정한다. 넘치는 내용은 내부에서 스크롤한다.
  // 이미지 로드 때 내용 높이를 따라 창을 재조정하면 스크롤바가 붙었다 떨어지며 떨린다.
  /** 후보 5개 비교·선택 · 인물별 체형 */
  candidates: { width: 720, height: 560 },
  /**
   * 저장 전 확인.
   *
   * 헤더 33 + 패딩 20 + 미리보기 128 + 간격 8 + 버튼 줄 38 + 테두리 2 = 229.
   * 미리보기가 48px였을 때는 116이었는데, 그 크기로는 어떤 포즈가 저장되는지
   * 알아볼 수 없었다. 추론은 256×256으로 그려 보내므로 128까지는 원본을 늘리지
   * 않는다.
   *
   * 이 항목이 없으면 barStateForPath가 null을 돌려주고 windowTargetForPath가 앱 모드
   * (1280×800)로 떨어진다 — 바에서 확인 화면에 들어가는 순간 창이 통째로 커진다.
   */
  review: { width: 360, height: 229 },
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
