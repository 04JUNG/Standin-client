import { isTauri } from "@tauri-apps/api/core";

/**
 * 외부 URL 열기(소셜 로그인 인가 페이지 등).
 *
 * - Tauri 데스크톱: OS 기본 브라우저로 연다(opener 플러그인). 콜백 토큰은 딥링크(`standin://auth/callback`)로 수신.
 * - dev 브라우저(vite): 새 탭으로 연다. 콜백은 same-origin `/auth/callback` 라우트로 수신.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
