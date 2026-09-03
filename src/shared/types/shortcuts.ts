/**
 * 단축키 타입 정의(docs/07 §7, docs/04 §13).
 * 정본 데이터는 shared/lib/shortcutRegistry.ts 하나뿐이다.
 * 앱 내 hook·네이티브 등록·설정 재지정 UI·치트시트가 모두 그 목록을 읽는다.
 */

/** 단축키가 살아 있는 범위. 화면 scope는 그 화면이 마운트된 동안에만 동작한다. */
export type ShortcutScope =
  | "global" // OS 전역. 네이티브(Rust)가 등록하며 앱이 백그라운드여도 동작.
  | "app" // 앱 셸 전체(AppShell 안의 모든 화면)
  | "bar" // 플로팅 바 전체(BarShell 안의 모든 상태)
  | "home"
  | "captureOverlay"
  | "inputPreview"
  | "poseViewer"
  | "save";

export type ShortcutId =
  | "capture.start"
  | "home.startCapture"
  | "bar.collapse"
  | "bar.capture"
  | "bar.upload"
  | "app.toggleCheatSheet"
  | "home.openFilePicker"
  | "captureOverlay.cancel"
  | "inputPreview.startAnalysis"
  | "inputPreview.discard"
  | "poseViewer.confirm"
  | "save.save"
  | "save.revealFolder"
  | "save.chooseFolder"
  | "save.newScene";

/**
 * 정규화된 단축키 문자열. `수정자*+code` 형태.
 *
 * 수정자 순서 고정: Mod → Alt → Shift → Meta.
 * `Mod` = Windows/Linux Ctrl, macOS Command.
 *
 * key 부분은 `KeyboardEvent.code` 값이다("KeyS" | "Digit1" | "Escape" | "Slash" | "Enter" …).
 * `key`가 아니라 `code`를 쓰는 이유: 레이아웃 독립적이라 한글 자판에서도 동일하게 동작한다.
 * 예: "Mod+Shift+KeyS", "Shift+Slash", "KeyR", "Escape"
 */
export type Accelerator = string;

export type ShortcutDef = {
  id: ShortcutId;
  /** 설정·치트시트에 표시할 한국어 라벨. */
  label: string;
  scope: ShortcutScope;
  /** 치트시트 부가 설명. */
  hint?: string;
  defaultAccelerator: Accelerator;
  /** 설정에서 재지정 가능 여부. 현재는 전역 단축키만 true. */
  customizable: boolean;
  /**
   * 다른 단축키의 바인딩을 그대로 따르는 항목. 전역 등록이 실패했거나 브라우저 개발
   * 모드일 때의 앱 내 대체 경로에 쓴다. 충돌 검사와 치트시트 목록에서 제외된다.
   */
  mirrorOf?: ShortcutId;
  /**
   * 텍스트 입력 중에도 동작시킬지. 미지정이면
   * "Shift 외 수정자 포함" 또는 "Escape"인 경우에만 허용한다(docs/07 §7).
   */
  allowWhileTyping?: boolean;
};
