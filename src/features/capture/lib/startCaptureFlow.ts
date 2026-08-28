import { router } from "@/app/router";
import { useInstallationStore } from "@/features/installation/installationStore";
import { idleRoute, type FlowOrigin } from "@/features/bar/lib/flowOrigin";
import { captureService } from "../api/capture.service";
import { CaptureError } from "../api/capture.contract";
import { globalShortcutService } from "../api/globalShortcut.service";
import { useCaptureStore } from "../store/captureStore";
import { currentSurface, trackEvent } from "@/features/analytics/analyticsClient";

/**
 * 캡처 시작 오케스트레이션. 홈 버튼과 전역 단축키가 같은 경로를 쓴다.
 *
 * React 밖(전역 단축키 이벤트 리스너)에서도 호출되므로 store.getState()와
 * router.navigate를 직접 쓴다. deepLinkAuth.ts가 딥링크 수신에 쓰는 것과 같은 방식이다.
 */

/**
 * 네이티브 캡처를 기다리는 한계 시간.
 *
 * 값 자체보다 "무한정 기다리지 않는다"가 요점이다. 응답이 오지 않으면 흐름이
 * `grabbing`에 묶이고, 재진입 방지가 이후 클릭을 전부 삼켜 버튼이 죽은 것처럼 된다
 * (0.1.1-beta.5 드래프트에서 실측 — 권한 프롬프트가 응답을 돌려주지 않았다).
 * 원인을 하나 고쳤어도 다음 원인에 같은 증상이 나오지 않게 여기서 끊는다.
 *
 * 캡처는 보통 1초 안에 끝난다. 큰 화면·느린 기기를 넉넉히 감안한 값이다.
 */
const GRAB_TIMEOUT_MS = 15_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CaptureError("CAPTURE_FAILED", "화면 캡처가 응답하지 않았습니다.")),
      ms,
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function captureErrorMessage(err: unknown): string {
  if (err instanceof CaptureError) {
    switch (err.code) {
      case "PERMISSION_DENIED":
        // 권한을 켜도 macOS는 앱을 다시 실행해야 반영한다. 그 안내가 빠지면 사용자는
        // 허용해 놓고도 같은 증상을 다시 겪는다(docs/07 §4).
        return "화면 기록 권한이 필요합니다. 시스템 설정 > 개인정보 보호 및 보안 > 화면 기록에서 Standin을 켠 뒤 앱을 다시 실행해 주세요.";
      case "UNSUPPORTED":
        return "이 환경에서는 화면 캡처를 사용할 수 없습니다.";
      default:
        return "화면 캡처에 실패했습니다. 다시 시도해 주세요.";
    }
  }
  return "화면 캡처에 실패했습니다. 다시 시도해 주세요.";
}

export async function startCaptureFlow(origin: FlowOrigin = "app"): Promise<void> {
  // 데이터 수집 동의 전에는 캡처를 시작하지 않는다(RequireInstallation 우회 금지).
  // 전역 단축키로 들어온 경우를 위해 창만 앞으로 가져온다.
  if (useInstallationStore.getState().status !== "registered") {
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
    const frame = await withTimeout(captureService.grabScreen(), GRAB_TIMEOUT_MS);
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
    const code = err instanceof CaptureError ? err.code : null;
    useCaptureStore.getState().setError(message, code);
    useCaptureStore.getState().setStatus("error");
    // 화면 기록 권한 거부는 설치했는데 캡처를 아예 못 쓰는 상태다. 온보딩 최대
    // 실패 지점이라 코드만 남긴다(취소는 위에서 걸러져 여기 오지 않는다).
    trackEvent("capture_failed", {
      code: code ?? "UNKNOWN",
      surface: currentSurface(),
    });
  }
}
