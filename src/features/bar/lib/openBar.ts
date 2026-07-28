import { router } from "@/app/router";
import { useAuthStore } from "@/features/auth/store/authStore";
import { globalShortcutService } from "@/features/capture/api/globalShortcut.service";
import { barStateForPath } from "./barSizes";

/**
 * 전역 단축키의 목적지(ADR-008).
 *
 * 사용자 요구는 "단축키를 누르거나 버튼을 눌러 나온 바에서 캡처 혹은 업로드"이므로
 * 단축키는 즉시 캡처가 아니라 바 진입이다. 이미 바가 떠 있으면 접는 토글로 동작한다.
 *
 * React 밖(네이티브 이벤트 리스너)에서 호출되므로 store.getState()와 router.navigate를
 * 직접 쓴다. deepLinkAuth.ts와 같은 방식이다.
 */
export async function toggleBar(): Promise<void> {
  // 미인증이면 바를 열지 않는다. 로그인 폼은 56×56에 들어갈 수 없으므로
  // 창만 앞으로 가져오고 RequireAuth가 로그인 화면으로 보낸다.
  if (useAuthStore.getState().status !== "authenticated") {
    await globalShortcutService.focusMainWindow();
    return;
  }

  const current = router.state.location.pathname;
  const barState = barStateForPath(current);

  // 흐름 도중(진행·후보·저장)에는 접지 않는다 — 작업을 잃지 않게.
  if (barState === "actions") {
    await router.navigate("/bar", { replace: true });
    return;
  }

  // 창을 앞으로 가져온 뒤 바를 편다.
  await globalShortcutService.focusMainWindow();
  if (barState === null) {
    await router.navigate("/bar/actions");
  } else if (barState === "collapsed") {
    await router.navigate("/bar/actions", { replace: true });
  }
  // 그 외(progress·candidates·save)는 이미 바가 떠 있으므로 그대로 둔다.
}
