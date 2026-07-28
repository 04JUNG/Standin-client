/** 창 모드 전환 계약(ADR-008). 창 조작은 Rust command 하나가 원자적으로 처리한다. */

/**
 * - `app`: 기본 앱 창(1280×800, 최소 960×640, 테두리 있음)
 * - `bar`: 항상 위에 뜨는 작은 바(테두리·리사이즈 없음)
 * - `overlay`: 캡처 영역 선택용 전체화면
 */
export type WindowMode = "app" | "bar" | "overlay";

export type WindowSize = { width: number; height: number };

export type WindowPosition = { x: number; y: number };

export interface WindowModeService {
  setMode(mode: WindowMode, size?: WindowSize): Promise<void>;
  getPosition(): Promise<WindowPosition | null>;
  setPosition(position: WindowPosition, size: WindowSize): Promise<void>;
}
