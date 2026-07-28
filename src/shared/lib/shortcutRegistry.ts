import type { Accelerator, ShortcutDef, ShortcutId, ShortcutScope } from "@/shared/types/shortcuts";

/**
 * 단축키 정본(docs/07 §7 기본값, docs/04 §13 화면 표시, docs/03 §9 설정).
 * 여기 없는 키는 앱 어디에서도 동작하지 않는다.
 *
 * 앱 내 hook(useShortcuts)·네이티브 등록(captureShortcut)·설정 재지정 UI·치트시트가
 * 모두 이 목록 하나를 읽는다. 목록을 다른 곳에 복제하지 않는다.
 *
 * 범위 제외: 후보 순차 탐색(↑/↓)과 후보 번호 선택(1~5)은 포즈 뷰어 담당자
 * 워크스트림("단축키 모드 순차 탐색")이므로 이 목록에 넣지 않는다. 그쪽 작업이
 * 착륙한 뒤 항목을 추가하면 된다.
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: "capture.start",
    label: "화면 캡처 시작",
    scope: "global",
    hint: "앱이 백그라운드여도 동작합니다.",
    // Windows Ctrl+Shift+S / macOS ⌘⇧S (docs/07 §7)
    defaultAccelerator: "Mod+Shift+KeyS",
    customizable: true,
  },
  {
    id: "home.startCapture",
    label: "화면 캡처 시작(앱 내)",
    scope: "home",
    hint: "전역 등록에 실패했거나 브라우저 개발 모드일 때만 동작합니다.",
    defaultAccelerator: "Mod+Shift+KeyS",
    customizable: false,
    mirrorOf: "capture.start",
  },
  {
    id: "app.toggleCheatSheet",
    label: "단축키 도움말",
    scope: "app",
    // ? = Shift+Slash. code 기반이라 자판이 달라도 같은 물리 키다.
    defaultAccelerator: "Shift+Slash",
    customizable: false,
  },
  {
    id: "home.openFilePicker",
    label: "파일 선택 열기",
    scope: "home",
    defaultAccelerator: "Mod+KeyO",
    customizable: false,
  },
  {
    id: "captureOverlay.cancel",
    label: "캡처 취소",
    scope: "captureOverlay",
    defaultAccelerator: "Escape",
    customizable: false,
  },
  {
    id: "inputPreview.startAnalysis",
    label: "분석 시작",
    scope: "inputPreview",
    defaultAccelerator: "Mod+Enter",
    customizable: false,
  },
  {
    id: "inputPreview.discard",
    label: "입력 취소",
    scope: "inputPreview",
    defaultAccelerator: "Escape",
    customizable: false,
  },
  {
    id: "poseViewer.rerun",
    label: "다른 후보 찾기",
    scope: "poseViewer",
    defaultAccelerator: "KeyR",
    customizable: false,
  },
  {
    id: "poseViewer.confirm",
    label: "이 포즈 사용하기",
    scope: "poseViewer",
    defaultAccelerator: "Mod+Enter",
    customizable: false,
  },
  {
    id: "save.save",
    label: "포즈 저장",
    scope: "save",
    hint: "파일 이름을 입력하는 중에도 동작합니다.",
    defaultAccelerator: "Mod+KeyS",
    customizable: false,
    allowWhileTyping: true,
  },
  {
    id: "save.chooseFolder",
    label: "저장 폴더 선택",
    scope: "save",
    defaultAccelerator: "Mod+Shift+KeyO",
    customizable: false,
    allowWhileTyping: true,
  },
  {
    id: "save.newScene",
    label: "새 장면 분석",
    scope: "save",
    defaultAccelerator: "Mod+KeyN",
    customizable: false,
    allowWhileTyping: true,
  },
];

export const SHORTCUTS_BY_ID: Record<ShortcutId, ShortcutDef> = Object.freeze(
  Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<ShortcutId, ShortcutDef>,
);

export const DEFAULT_BINDINGS: Record<ShortcutId, Accelerator> = Object.freeze(
  Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.defaultAccelerator])) as Record<
    ShortcutId,
    Accelerator
  >,
);

/**
 * mirrorOf 항목은 원본의 바인딩을 따른다. 재지정은 항상 원본 하나만 바꾸므로
 * 대체 경로가 자동으로 같은 키를 쓴다.
 */
export function resolveAccelerator(
  id: ShortcutId,
  bindings: Record<ShortcutId, Accelerator>,
): Accelerator | undefined {
  const def = SHORTCUTS_BY_ID[id];
  if (!def) return undefined;
  return bindings[def.mirrorOf ?? id];
}

export const SCOPE_LABEL: Record<ShortcutScope, string> = {
  global: "전역",
  app: "모든 화면",
  home: "홈",
  captureOverlay: "캡처 영역 선택",
  inputPreview: "입력 미리보기",
  poseViewer: "포즈 후보",
  save: "저장",
};

/** 치트시트·설정 화면의 표시 순서. */
export const SCOPE_ORDER: readonly ShortcutScope[] = [
  "global",
  "app",
  "home",
  "captureOverlay",
  "inputPreview",
  "poseViewer",
  "save",
];

/** 치트시트/설정 목록용. mirrorOf 항목은 원본과 중복이므로 제외한다. */
export function listedShortcuts(scope: ShortcutScope): ShortcutDef[] {
  return SHORTCUTS.filter((s) => s.scope === scope && !s.mirrorOf);
}
