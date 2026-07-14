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

## 7. 전역 단축키

기본 후보:

- Windows: `Ctrl+Shift+S`
- macOS: `Command+Shift+S`

운영체제 기본 단축키와 충돌 여부를 확인해야 한다.

요구사항:

- 설정에서 변경
- 충돌 시 등록 실패 안내
- 앱 종료 시 해제
- 입력 필드 타이핑과 충돌하지 않음
- 화면에 현재 단축키 표시

이번 주에는 앱 내부 버튼을 먼저 구현하고 전역 단축키는 여유가 있을 때 추가한다.

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

- 현재 커서가 있는 모니터에서 영역 캡처
- 또는 모든 모니터를 하나의 overlay로 처리

반드시 테스트:

- 배율 100% / 125% / 150%
- 주 모니터와 보조 모니터 배율 다름
- 음수 좌표 모니터
- 세로 모니터
- macOS Retina

첫 구현이 단일 모니터만 안정적이라면 UI에서 명시하고 후속 범위로 둔다.

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
