import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { captureService } from "../api/capture.service";
import { CaptureError } from "../api/capture.contract";
import { useCaptureStore } from "../store/captureStore";

function messageFor(err: unknown): string {
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

/** 화면 캡처 시작: 전체 화면을 잡아 프레임을 store에 넣고 오버레이로 이동. */
export function useStartCapture() {
  const navigate = useNavigate();
  const setFrame = useCaptureStore((s) => s.setFrame);
  const setStatus = useCaptureStore((s) => s.setStatus);
  const setError = useCaptureStore((s) => s.setError);
  const reset = useCaptureStore((s) => s.reset);
  const [error, setLocalError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const start = useCallback(async () => {
    setLocalError(null);
    setError(null);
    setStatus("grabbing");
    setIsStarting(true);
    try {
      const frame = await captureService.grabScreen();
      setFrame(frame);
      setStatus("selecting");
      navigate("/app/capture");
    } catch (err) {
      // 취소는 오류가 아니라 정상 복귀(docs/07 §6).
      if (err instanceof CaptureError && err.code === "CANCELLED") {
        reset();
        return;
      }
      const message = messageFor(err);
      setError(message);
      setStatus("error");
      setLocalError(message);
    } finally {
      setIsStarting(false);
    }
  }, [navigate, reset, setError, setFrame, setStatus]);

  return { start, isStarting, error };
}
