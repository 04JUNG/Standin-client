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

export interface CaptureService {
  /** 커서가 있는 화면을 캡처해 프리즈 프레임으로 반환. 앱 창은 캡처에서 제외한다. */
  grabScreen(): Promise<ScreenFrame>;
}
