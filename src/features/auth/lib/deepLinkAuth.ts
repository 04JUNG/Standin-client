import { isTauri } from "@tauri-apps/api/core";
import { router } from "@/app/router";
import { toAppError } from "@/shared/api/errors";
import { useAuthStore } from "../store/authStore";
import { takePendingReturnTo } from "./returnTo";

/**
 * 소셜 로그인 딥링크 수신(Tauri 데스크톱).
 * BFF가 `OAUTH_SUCCESS_REDIRECT=standin://auth/callback?code=…` 로 리디렉트하면 여기서
 * 1회용 코드를 받아 토큰으로 교환하고 원래 가려던 화면으로 이동한다.
 * (dev 브라우저는 `/auth/callback` 라우트가 같은 일을 한다)
 *
 * ⚠ 토큰은 URL에 실려 오지 않는다 — 딥링크 URL은 OS에 흔적이 남는다(docs/06 §6).
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

  const store = useAuthStore.getState();
  const code = parsed.searchParams.get("code");
  if (!code) {
    // 조용히 로그인 화면으로 보내면 사용자에게는 "아무 일도 안 일어난" 것처럼 보인다.
    store.setLoginError("소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
    void router.navigate("/auth/login", { replace: true });
    return;
  }

  void store
    .completeOAuth(code)
    .then(() => router.navigate(takePendingReturnTo(), { replace: true }))
    .catch((err: unknown) => {
      store.setLoginError(toAppError(err).message);
      return router.navigate("/auth/login", { replace: true });
    });
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
