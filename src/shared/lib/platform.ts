/** TS 측 운영체제 분기는 이 파일에만 둔다(CLAUDE.md §10 "운영체제 분기는 한 파일에 모은다"). */

/**
 * macOS 여부. 단축키 표시(⌘)와 Mod 수정자 해석에 쓴다.
 * 웹뷰 UA만으로 충분해서 plugin-os 의존을 추가하지 않는다.
 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}
