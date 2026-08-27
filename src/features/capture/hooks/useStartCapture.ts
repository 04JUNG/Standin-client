import { useCallback } from "react";
import { useCaptureStore } from "../store/captureStore";
import { startCaptureFlow } from "../lib/startCaptureFlow";

/**
 * 화면 캡처 시작(홈 버튼용). 오케스트레이션은 startCaptureFlow가 소유하고
 * 여기서는 화면이 쓸 상태만 store에서 파생한다 — 전역 단축키가 같은 흐름을
 * React 밖에서 호출해도 상태가 어긋나지 않게 하기 위해서다.
 */
export function useStartCapture() {
  const status = useCaptureStore((s) => s.status);
  const error = useCaptureStore((s) => s.error);
  const errorCode = useCaptureStore((s) => s.errorCode);

  const start = useCallback(() => startCaptureFlow(), []);

  return { start, isStarting: status === "grabbing", error, errorCode };
}
