import { router } from "@/app/router";
import { useAuthStore } from "@/features/auth/store/authStore";
import { idleRoute, type FlowOrigin } from "@/features/bar/lib/flowOrigin";
import { captureService } from "../api/capture.service";
import { CaptureError } from "../api/capture.contract";
import { globalShortcutService } from "../api/globalShortcut.service";
import { useCaptureStore } from "../store/captureStore";

/**
 * 캡처 시작 오케스트레이션. 홈 버튼과 전역 단축키가 같은 경로를 쓴다.
 *
 * React 밖(전역 단축키 이벤트 리스너)에서도 호출되므로 store.getState()와
 * router.navigate를 직접 쓴다. deepLinkAuth.ts가 딥링크 수신에 쓰는 것과 같은 방식이다.
 */

export function captureErrorMessage(err: unknown): string {
  if (err instanceof CaptureError) {
    switch (err.code) {
      case "PERMISSION_DENIED":
        return "화면 기록 권한이 필요합니다. 시스템 설정에서 권한을 허용해 주세요.";
      case "UNSUPPORTED":
        return "이 환경에서는 화면 캡처를 사용할 수 없습니다.";
      default:
        return "화면 캡처에 실패했습니다. 다시 시도해 주세요.";
    }
  }
  return "화면 캡처에 실패했습니다. 다시 시도해 주세요.";
}

export async function startCaptureFlow(origin: FlowOrigin = "app"): Promise<void> {
  const auth = useAuthStore.getState();
  // 미인증 상태에서는 캡처를 시작하지 않는다(RequireAuth 우회 금지, docs/06 §7).
  // 전역 단축키로 들어온 경우를 위해 창만 앞으로 가져온다.
  if (auth.status !== "authenticated") {
    await globalShortcutService.focusMainWindow();
    return;
  }

  const capture = useCaptureStore.getState();
  // 재진입 방지: 이미 캡처 중이거나 오버레이가 떠 있으면 무시한다.
  if (capture.status === "grabbing" || capture.status === "selecting") return;
  if (router.state.location.pathname === "/app/capture") return;

  // 오버레이가 끝난 뒤 돌아갈 곳을 기억한다(바에서 시작했으면 바로 복귀).
  capture.setOrigin(origin);
  capture.setError(null);
  capture.setStatus("grabbing");
  try {
    const frame = await captureService.grabScreen();
    useCaptureStore.getState().setFrame(frame);
    useCaptureStore.getState().setStatus("selecting");
    await router.navigate("/app/capture");
  } catch (err) {
    // 취소는 오류가 아니라 정상 복귀(docs/07 §6).
    if (err instanceof CaptureError && err.code === "CANCELLED") {
      useCaptureStore.getState().reset();
      await router.navigate(idleRoute(origin), { replace: true });
      return;
    }
    const message = captureErrorMessage(err);
    useCaptureStore.getState().setError(message);
    useCaptureStore.getState().setStatus("error");
  }
}
