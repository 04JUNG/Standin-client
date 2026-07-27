import { isTauri } from "@tauri-apps/api/core";
import { router } from "@/app/router";
import { useAuthStore } from "../store/authStore";

/**
 * 소셜 로그인 딥링크 수신(Tauri 데스크톱).
 * BFF가 `OAUTH_SUCCESS_REDIRECT=standin://auth/callback?accessToken=…&refreshToken=…` 로 리디렉트하면
 * 여기서 토큰을 받아 세션을 완성하고 홈으로 이동한다. (dev 브라우저는 `/auth/callback` 라우트가 처리)
 */
function handleUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  // standin://auth/callback → host "auth", pathname "/callback"
  const isCallback = parsed.host === "auth" || parsed.pathname.includes("callback");
  if (!isCallback) return;
  const accessToken = parsed.searchParams.get("accessToken");
  const refreshToken = parsed.searchParams.get("refreshToken") ?? undefined;
  if (!accessToken) return;
  void useAuthStore
    .getState()
    .completeOAuth(accessToken, refreshToken)
    .then(() => router.navigate("/app/home", { replace: true }))
    .catch(() => router.navigate("/auth/login", { replace: true }));
}

/** 앱 시작 시 1회 호출. Tauri가 아니면 no-op. */
export async function initDeepLinkAuth(): Promise<void> {
  if (!isTauri()) return;
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  // 앱이 딥링크로 콜드 스타트된 경우
  const initial = await getCurrent().catch(() => null);
  if (initial) initial.forEach(handleUrl);
  // 앱 실행 중 수신
  await onOpenUrl((urls) => urls.forEach(handleUrl));
}
