# ADR-007: 전역 단축키 등록 계층

- 상태: 제안됨
- 날짜: 2026-07-27
- 관련 문서: docs/07_CAPTURE_AND_UPLOAD_SPEC.md §7, docs/02_APP_ARCHITECTURE.md §4, docs/11_QA_SECURITY_RELEASE.md §3

## 배경

`docs/07` §7은 앱이 백그라운드일 때도 동작하는 전역 캡처 단축키를 요구한다. 설정에서 변경할 수 있어야 하고, 충돌 시 등록 실패를 안내해야 하며, 앱 종료 시 해제되어야 한다.

`tauri-plugin-global-shortcut`은 Rust 쪽 등록 API와 JS 쪽 래퍼 API를 모두 제공한다. 어느 계층이 등록을 소유할지 정해야 한다. 이 결정은 되돌리기 비용이 크다 — capability 목록과 command 계약이 함께 바뀌기 때문이다.

제약:

- 최소 capability 원칙(docs/11 §3). 현재 `capabilities/default.json`은 `core:default`, `core:window:allow-set-fullscreen`, `opener:default`, `deep-link:default` 넷뿐이다.
- CLAUDE.md §9는 "앱 전역 단축키 등록"을 Tauri command 책임으로 지정한다.
- docs/02 §3·§4는 이미 `commands/shortcuts.rs`와 `register_capture_shortcut`을 구조에 예약해 두었다.
- 사용자가 설정에서 키를 바꾸면 즉시 재등록되어야 한다.

## 선택지

### A. Rust command가 등록을 소유한다 (권장)

`commands/shortcuts.rs`에 `register_capture_shortcut(accelerator)`를 두고, 핸들러가 `shortcut://capture` 이벤트를 프론트로 emit한다. 프론트는 이벤트를 받아 기존 캡처 흐름을 실행한다.

- 장점: **capability 추가가 0개다.** `generate_handler!`에 등록한 자체 command는 Tauri v2에서 permission 대상이 아니고(현재 4개 권한만으로 `grab_screen`이 동작하는 것이 증거), JS `listen()`은 `core:default`에 포함된 `core:event:default`가 커버한다.
- 장점: 캡처용 창 조작이 이미 `capture.rs`에 있어 네이티브 관심사가 한곳에 모인다.
- 단점: 재등록이 `invoke` 왕복을 거친다.

### B. JS 플러그인 API로 프론트에서 등록한다

`@tauri-apps/plugin-global-shortcut`으로 TypeScript에서 직접 register/unregister한다.

- 장점: 설정 변경 시 재등록이 같은 언어 안에서 끝난다.
- 단점: `global-shortcut:allow-register`·`allow-unregister`에 더해, 단축키가 눌렸을 때 창을 앞으로 가져오려면 `core:window:allow-show`·`allow-unminimize`·`allow-set-focus`까지 열어야 한다. `setFullscreen`이 `core:window:allow-set-fullscreen`을 명시적으로 요구한 선례가 이를 증명한다.
- 단점: docs/02가 예약한 구조(`shortcuts.rs`)와 어긋난다.

## 결정

**A**를 택한다.

"재등록이 TS에서 더 쉽다"는 B의 장점은 실제로는 성립하지 않는다. `register_capture_shortcut(accelerator)`가 이전 바인딩을 먼저 해제하므로 재지정도 `invoke` 한 번이고, 호출 편의성이 A와 B에서 같다. 반면 capability 비용 차이는 실재한다(0개 대 5개 이상). docs/11 §3의 최소 capability 원칙이 결정을 가른다.

## 결과

- `commands/shortcuts.rs`에 `register_capture_shortcut` · `unregister_capture_shortcut` · `focus_main_window`를 추가하고 `capabilities/default.json`은 그대로 둔다.
- 핸들러는 `ShortcutState::Pressed`만 처리한다. 플러그인이 Pressed와 Released 양쪽에 콜백을 주므로 필터가 없으면 키 한 번에 두 번 발동한다.
- 모듈 전체를 `cfg(desktop)`로 자르지 않고 플러그인에 의존하는 본문만 가른다. 모듈을 잘라내면 `generate_handler!` 목록을 플랫폼마다 중복 관리해야 하고 둘이 어긋날 위험이 생긴다. 모바일에서는 `UNSUPPORTED`를 반환한다.
- **등록 소유자는 프론트의 `captureShortcut.ts` 하나다.** startup에서 Rust가 스스로 등록하지 않는다 — 사용자 재지정값이 프론트 localStorage에 있으므로, Rust에 값을 이중 보관하면 진실 공급원이 둘이 된다.
- 앱 종료 시 해제(docs/07 §7)는 플러그인 teardown이 담당한다. 명시적 해제 경로는 `unregister_capture_shortcut`으로 열어 둔다.
- accelerator 표기는 `수정자*+KeyboardEvent.code`를 정본으로 쓰고 네이티브로 넘길 때 `Mod`만 `CmdOrCtrl`로 바꾼다. global-hotkey 0.8의 `parse_key`가 입력을 대문자화해 `KEYS`·`SLASH`·`ARROWUP` 같은 code 이름을 그대로 받으므로 키 변환표가 필요 없다. 변환표를 두면 표에서 빠진 키를 조용히 거부하는 함정이 된다.
- OS 수준 충돌은 등록을 시도해야만 알 수 있다. 실패 시 `REGISTER_FAILED`를 안내하고 이전 키로 되돌릴 수 있게 한다.
- 재검토 조건:
  - 전역 단축키가 둘 이상으로 늘어나면 `unregister_all` 대신 `State`에 개별 추적을 넣어야 한다.
  - macOS `global-hotkey`가 타 앱 점유 중에도 성공을 보고하는 사례가 확인되면 안내 문구와 검증 방식을 다시 본다(docs/11 §1).
