/**
 * 외부 URL 열기(소셜 로그인 인가 페이지 등).
 *
 * dev 브라우저(vite)에서는 새 탭으로 열린다.
 * TODO(desktop): Tauri 패키지 앱에서는 OS 브라우저로 열고 콜백 토큰을 딥링크로 받아야 한다.
 *   → `@tauri-apps/plugin-opener`(URL 열기) + `@tauri-apps/plugin-deep-link`(콜백 수신) 도입,
 *      BFF의 `OAUTH_SUCCESS_REDIRECT`를 앱 딥링크(예: `standin://auth/callback`)로 설정.
 */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
