import { useCallback, useEffect, useState } from "react";
import { captureService } from "../api/capture.service";
import type { ScreenPermissionStatus } from "../api/capture.contract";

/**
 * 화면 기록 권한 상태와 요청 동작(ADR-003 2026-08-28 정정).
 *
 * 온보딩 단계와 설정 화면이 같은 로직을 쓴다. 화면을 여는 것만으로 프롬프트가 뜨면
 * 사용자는 무엇을 허용하는지 모른 채 결정하게 되므로, 조회(`status`)와 요청(`request`)을
 * 분리해 요청은 버튼을 눌렀을 때만 나가게 한다.
 */
export function useScreenPermission() {
  const [status, setStatus] = useState<ScreenPermissionStatus | "checking">("checking");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await captureService.screenPermissionStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    void captureService.screenPermissionStatus().then((next) => {
      if (alive) setStatus(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(async () => {
    setBusy(true);
    try {
      const next = await captureService.requestScreenPermission();
      setStatus(next);
      // 프롬프트가 떴어도 사용자가 아직 응답하지 않았으면 denied가 돌아온다. 그래서
      // "요청했는가"를 따로 기억한다 — 이 값으로 안내를 프롬프트 전/후로 나눈다.
      setRequested(true);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const openSettings = useCallback(() => captureService.openScreenRecordingSettings(), []);

  return {
    status,
    /** 이 플랫폼에서 안내가 필요한가. Windows·브라우저에서는 항상 false다. */
    needsPermission: status === "denied",
    requested,
    busy,
    request,
    refresh,
    openSettings,
  };
}
