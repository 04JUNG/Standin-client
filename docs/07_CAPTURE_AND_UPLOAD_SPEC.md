# 화면 캡처 및 업로드 명세

## 1. 이번 주 목표

- 홈에서 `화면 캡처` 실행
- 사용자가 영역을 선택
- Escape로 취소
- 캡처 결과 미리보기
- `다시 캡처`, `취소`, `이 이미지 사용`
- 사용한 이미지를 업로드 대기 상태로 전달
- 캡처 권한 거부와 실패 처리

---

## 2. 입력 방식 우선순위

### P0

- 파일 선택
- 드래그 앤 드롭
- 화면 영역 캡처

### P1

- 클립보드 이미지 붙여넣기
- 창 캡처
- 전체 화면 캡처
- 전역 단축키

### P2

- 화면 녹화
- 녹화 프레임 선택
- 반복 캡처 히스토리

---

## 3. 캡처 사용자 흐름

```text
홈
→ 화면 캡처 클릭
→ 앱 창 숨김 또는 최소화
→ 화면 overlay 표시
→ 드래그로 영역 선택
├─ Escape → 취소 → 앱 복귀
└─ 선택 완료
   → PNG 임시 저장
   → 앱 복귀
   → 캡처 미리보기
      ├─ 다시 캡처
      ├─ 취소
      └─ 이 이미지 사용
          → UploadDraft 생성
```

### 시작 지점에 따른 복귀 (ADR-008)

위 흐름의 "앱 복귀"는 **앱 창에서 시작했을 때**의 이야기다. 플로팅 바에서 시작하면 앱 창을 거치지 않고 바로 복귀한다.

```text
바 → 캡처 → 오버레이 → 선택 완료 → 바(분석 진행) → 바(후보) → 바(저장)
                     └─ Escape → 취소 → 바(동작)
```

진입 시점에 `origin`(`app` | `bar`)을 기록하고 이후 단계가 그 값으로 목적지를 계산한다. 각 단계가 개별적으로 분기하지 않는다.

바 모드에서는 미리보기 단계를 건너뛰고 바로 분석에 들어간다. 어느 쪽이든 캡처 직전 창을 숨기므로 결과물에 앱·바가 찍히지 않는다.

---

## 4. 권한

### macOS

- 화면 기록 권한이 필요할 수 있음
- 권한이 없으면 시스템 설정으로 이동하는 안내 제공
- 권한 부여 후 앱 재실행 필요 여부 안내

### Windows

- 일반 화면 캡처는 추가 권한 없이 가능할 수 있으나, 보호된 화면과 일부 GPU 창은 검은 화면이 될 수 있음
- 다중 DPI와 모니터 배율 처리 필요

권한 세부 구현은 ADR로 확정한다.

---

## 5. 구현 경계

### Rust/Tauri

- 캡처 overlay 또는 캡처 backend
- 실제 화면 픽셀 획득
- 영역 좌표와 모니터 좌표 변환
- 임시 PNG 저장
- 결과 경로·크기 반환
- Escape 취소
- 임시 파일 정리

### React

- 캡처 시작 버튼
- 안내 modal
- 캡처 미리보기
- 다시 캡처
- 업로드 초안 생성
- 오류 메시지
- 권한 안내

---

## 6. Tauri command 계약 초안

```ts
type CaptureRegionResult = {
  filePath: string;
  width: number;
  height: number;
  monitorId?: string;
  createdAt: string;
};

type CaptureErrorCode =
  | "CANCELLED"
  | "PERMISSION_DENIED"
  | "CAPTURE_FAILED"
  | "SAVE_FAILED"
  | "UNSUPPORTED";

invoke<CaptureRegionResult>("capture_region");
```

취소는 일반 오류 toast가 아니라 정상적인 사용자 행동으로 처리한다.

---

## 7. 단축키

### 전역 캡처 단축키

기본값: `Ctrl+Alt+S`(Windows/Linux) / `Command+Option+S`(macOS).

내부 표기는 `Mod+Alt+KeyS` 하나로 두고 `Mod`가 OS 분기를 흡수한다. 등록은 Rust command가 담당한다(ADR-007).

`Ctrl+Shift+S`를 쓰지 않는다. 클립스튜디오 기본 "다른 이름으로 저장"이 같은 조합이라 CSP가 먼저 떠 있으면 Windows `RegisterHotKey`가 실패한다. 대상 사용자는 항상 CSP를 띄워 둔 채 이 앱을 쓰므로, 충돌하는 조합은 기본값이 될 수 없다. 작가 인터뷰에서 실측된 실패다.

**목적지는 플로팅 바다**(ADR-008). 즉시 캡처가 아니라 바를 열고, 캡처는 바의 버튼(또는 `C`)으로 시작한다. 이미 바가 펼쳐져 있으면 접는 토글로 동작하며, 흐름 도중(진행·후보·저장)에는 작업을 잃지 않도록 접지 않는다.

요구사항과 구현 상태:

| 요구사항 | 구현 |
|---|---|
| 설정에서 변경 | 설정 › 단축키에서 재지정. 충돌 검사 후 저장 |
| 충돌 시 등록 실패 안내 | 설정에 인라인 오류 + "이전 단축키로 되돌리기". 더해 **앱 셸 배너**와 **바 경고 아이콘**으로 모든 화면에 노출 |
| 앱 종료 시 해제 | 플러그인 teardown이 처리. `unregister_capture_shortcut`도 노출 |
| 입력 필드 타이핑과 충돌하지 않음 | 앱 내 단축키는 포커스 가드로 차단(아래) |
| 화면에 현재 단축키 표시 | 홈 캡처 CTA 배지 · 설정 목록 · 치트시트 |

전역 등록에 실패했거나 브라우저 개발 모드이면 같은 키가 **앱이 활성일 때만** 동작하는 대체 경로로 내려간다. 이때 배지를 흐리게 표시하고 그 사실을 안내한다 — 동작하지 않는 기능을 동작하는 것처럼 보이지 않게 한다(CLAUDE.md §10).

등록 실패(`failed`)는 설정 화면에만 두지 않는다. `GlobalShortcutAlert`가 앱 셸 상단에 배너로, `GlobalShortcutIndicator`가 플로팅 바 헤더에 아이콘으로 함께 띄운다. 실패가 조용하면 실패하지 않은 것처럼 보이고, 실제로 그렇게 시연이 진행된 적이 있다. `unavailable`(브라우저 개발 모드)은 사용자가 할 수 있는 일이 없으므로 경고하지 않는다.

### accelerator 표기

정본은 `수정자*+KeyboardEvent.code`이고 수정자 순서는 `Mod → Alt → Shift → Meta`로 고정한다.

`key`가 아니라 `code`를 쓰는 이유는 레이아웃 독립성이다. `?`는 `key`로 보면 자판마다 다르지만 `code`로는 항상 `Shift+Slash`라 한글 자판에서도 같은 물리 키를 가리킨다.

### 앱 내 단축키

화면별로 동작하며 재지정은 지원하지 않는다(치트시트로만 노출). 목록의 정본은 `src/shared/lib/shortcutRegistry.ts` 하나이며, 앱 내 훅·네이티브 등록·설정 UI·치트시트가 모두 그것을 읽는다.

| 화면 | 키 | 동작 |
|---|---|---|
| 모든 화면 | `?` | 단축키 치트시트 |
| 플로팅 바 | `C` / `U` / `Esc` | 화면 캡처 / 파일 업로드 / 바 접기 |
| 홈 | `Ctrl+O` | 파일 선택 열기 |
| 캡처 영역 선택 | `Esc` | 취소(정상 복귀) |
| 입력 미리보기 | `Ctrl+Enter` / `Esc` | 분석 시작 / 입력 취소 |
| 포즈 후보 | `R` / `Ctrl+Enter` | 다시 검색 / 이 포즈 사용하기 |
| 저장 | `Ctrl+S` / `Ctrl+Shift+O` / `Ctrl+N` | 저장 / 폴더 선택 / 새 장면 |

후보 순차 탐색(방향키)과 후보 번호 선택(1~5)은 포즈 뷰어 워크스트림 소관이라 이 목록에 없다.

### 타이핑 충돌 방지

입력 요소(`input` · `textarea` · `select` · `contenteditable` · `role=textbox`)에 포커스가 있으면 **Shift 외 수정자를 포함하거나 `Esc`인 키만** 동작한다. 저장의 `Ctrl+S`는 파일 이름 입력 중에도 동작해야 하므로 명시적으로 허용한다.

한글 IME 조합 중(`isComposing`)에는 어떤 단축키도 개입하지 않는다. 자동 반복(`repeat`)도 무시한다.

모달이 열려 있는 동안에는 화면 단축키가 물러나고 모달이 키를 소유한다.

---

## 8. 업로드 파일 정책

초기 지원:

- PNG
- JPG/JPEG
- WEBP

추후:

- PDF 페이지
- PSD/CLIP 직접 처리
- 영상

권장 제한:

- 최대 파일 크기는 서버 정책과 맞춤
- 최소 이미지 크기 검증
- MIME과 확장자 모두 확인
- 원본 파일은 수정하지 않음

---

## 9. UploadDraft 모델

```ts
type UploadSource = "file" | "capture" | "clipboard";

type UploadDraft = {
  id: string;
  source: UploadSource;
  localPath?: string; // capture, 또는 Tauri dialog로 선택한 파일
  file?: File;        // drag&drop / 클립보드 붙여넣기 (경로가 없을 수 있는 브라우저 File)
  previewUrl: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes?: number;
  createdAt: string;
};
```

Tauri 환경에서 브라우저 `File`과 로컬 경로 처리 방식이 다르다. `source`에 따라 `localPath`와 `file` 중 하나가 채워지며(capture/파일선택 → `localPath`, drag&drop/클립보드 → `file`), API upload adapter에서 이 차이를 흡수한다. 이 타입 정의는 `docs/09_STATE_AND_DATA_MODEL.md`와 동일하게 유지한다.

---

## 10. 미리보기 화면

필수:

- 이미지
- 크기
- 원본명
- 입력 출처
- 제거
- 다시 선택
- 분석 시작

선택:

- 회전
- 크롭
- 인물 수 수정

이번 주에는 회전·크롭을 UI 자리만 두거나 제외한다.

---

## 11. 임시 파일 정책

- 앱 전용 temp 디렉터리 사용
- 임의의 사용자 폴더에 저장하지 않음
- 취소한 캡처는 삭제
- 분석이 끝난 임시 파일은 일정 시점에 삭제
- 앱 비정상 종료 후 오래된 temp 정리
- 파일명에 민감정보를 넣지 않음

예:

```text
{appTemp}/captures/{uuid}.png
```

---

## 12. 다중 모니터

MVP 기준:

- 현재 커서가 있는 모니터에서 영역 캡처 ← **채택·구현됨**
- 또는 모든 모니터를 하나의 overlay로 처리

구현(`capture.rs` · `window_mode.rs`):

`grab_screen`이 `window.cursor_position()`으로 커서를 읽고 `Monitor::from_point`로 대상 모니터를 고른다. 커서를 못 읽거나 어느 모니터에도 속하지 않으면 주 모니터 → 첫 모니터로 내려간다.

**같은 모니터 경계를 `ScreenFrame.monitor`에 실어 프론트로 보내고, 오버레이 모드가 그 값을 그대로 받아 창을 옮긴 뒤 전체화면으로 만든다.** 이 연결이 핵심이다. 이전에는 캡처 대상(주 모니터 고정)과 오버레이 위치(`set_fullscreen`이 덮는 "창이 있던 모니터")가 각자 정해져서, 듀얼 모니터 + 액정 타블렛 환경에서 A 모니터 사진을 B 모니터에 띄웠다(작가 인터뷰에서 실패). 두 값이 한 출처에서 나오지 않으면 언제든 다시 갈라진다.

경계는 **물리 픽셀**로 주고받는다. 논리 좌표는 창의 현재 scale factor로 해석되는데, 배율이 다른 모니터로 옮기는 순간 그 값이 목적지와 다르다.

반드시 테스트:

- 배율 100% / 125% / 150%
- 주 모니터와 보조 모니터 배율 다름
- 음수 좌표 모니터
- 세로 모니터
- macOS Retina

아직 실기로 확인하지 못한 것: 배율이 다른 두 모니터 조합, 음수 좌표 모니터, 세로 모니터. 모니터 경계와 프레임이 같은 모니터에서 나오므로 종횡비는 맞지만, 혼합 DPI에서 `set_fullscreen`이 창 크기를 어떻게 정하는지는 실측이 필요하다.

---

## 13. 화면 녹화 준비

이번 MVP에서는 실제 녹화를 구현하지 않더라도 인터페이스는 구분한다.

```ts
interface CaptureService {
  captureRegion(): Promise<CaptureRegionResult>;
  startRecording?(): Promise<RecordingSession>;
  stopRecording?(): Promise<RecordingResult>;
}
```

녹화 버튼을 enabled로 보여주지 않는다.

---

## 14. 테스트 시나리오

- 영역 캡처 성공
- Escape 취소
- 너무 작은 영역
- 권한 거부
- 저장 실패
- 앱 복귀
- 다시 캡처
- 미리보기에서 취소
- 캡처 결과 업로드 초안 생성
- 다중 모니터
- 고배율 디스플레이
- 임시 파일 삭제
