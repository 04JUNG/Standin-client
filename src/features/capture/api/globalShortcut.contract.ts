/** 전역 단축키 등록 계약(docs/07 §7). 등록은 Rust command가 담당한다(CLAUDE.md §9). */

export type GlobalShortcutErrorCode =
  /** accelerator 문자열을 네이티브가 파싱하지 못함. */
  | "INVALID_ACCELERATOR"
  /** 다른 프로그램이 이미 점유 중이거나 OS가 거부함. */
  | "REGISTER_FAILED"
  | "UNREGISTER_FAILED"
  /** 브라우저 개발 모드 등 전역 등록이 불가능한 환경. */
  | "UNSUPPORTED";

export class GlobalShortcutError extends Error {
  constructor(
    public readonly code: GlobalShortcutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GlobalShortcutError";
  }
}

export interface GlobalShortcutService {
  /** 네이티브 accelerator 문자열로 등록한다. 이전 등록은 네이티브가 먼저 해제한다. */
  register(accelerator: string): Promise<void>;
  unregister(): Promise<void>;
  /** 캡처를 시작하지 않고 창만 앞으로 가져온다(미인증 상태 등). */
  focusMainWindow(): Promise<void>;
}
