/**
 * 화면 캡처 계약. docs/07 §6, ADR-003.
 * 구현은 프리즈 프레임 방식: 전체 화면을 한 번 캡처해 프레임으로 받고,
 * 영역 선택과 크롭은 프론트에서 수행한다.
 */
/**
 * 캡처한 모니터의 가상 데스크톱 상 경계. **물리 픽셀**이다.
 *
 * 오버레이를 이 모니터에 띄우는 데 쓴다. 캡처 대상과 오버레이 위치가 각자 정해지면
 * 다른 화면 사진을 엉뚱한 화면에 띄우게 된다(듀얼 모니터에서 실측).
 */
export type MonitorBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenFrame = {
  /** 캡처된 전체 화면 PNG의 data URL */
  dataUrl: string;
  /** 프레임의 물리 픽셀 크기 */
  width: number;
  height: number;
  /** 이 프레임이 어느 모니터의 것인지 */
  monitor: MonitorBounds;
};

export type CaptureErrorCode =
  "CANCELLED" | "PERMISSION_DENIED" | "CAPTURE_FAILED" | "SAVE_FAILED" | "UNSUPPORTED";

export class CaptureError extends Error {
  constructor(
    public readonly code: CaptureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

/**
 * 화면 기록 권한 상태(macOS). `notRequired`는 권한 개념이 없는 플랫폼이다 —
 * `denied`와 섞으면 Windows에서 존재하지 않는 설정 화면을 안내하게 된다.
 */
export type ScreenPermissionStatus = "granted" | "denied" | "not_required";

export interface CaptureService {
  /** 커서가 있는 화면을 캡처해 프리즈 프레임으로 반환. 앱 창은 캡처에서 제외한다. */
  grabScreen(): Promise<ScreenFrame>;
  /**
   * macOS 화면 기록 설정 화면을 연다(docs/07 §4). 다른 OS에서는 아무 일도 하지 않는다.
   * 권한을 한 번 거부하면 시스템 프롬프트가 다시 뜨지 않으므로 이 경로가 유일한 복구 수단이다.
   */
  openScreenRecordingSettings(): Promise<void>;
  /** 프롬프트 없이 현재 권한 상태만 읽는다. 온보딩 화면이 안내를 고르는 데 쓴다. */
  screenPermissionStatus(): Promise<ScreenPermissionStatus>;
  /** 시스템 프롬프트를 띄우고 그 뒤의 상태를 반환한다. 사용자가 버튼을 눌렀을 때만 호출한다. */
  requestScreenPermission(): Promise<ScreenPermissionStatus>;
}
