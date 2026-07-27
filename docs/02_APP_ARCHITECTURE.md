# Tauri 앱 아키텍처

## 1. 전체 구조

```text
┌────────────────────────────────────────────┐
│ Tauri Desktop App                          │
│                                            │
│  React UI                                  │
│  ├─ Auth                                   │
│  ├─ Home / Input                           │
│  ├─ Analysis Job                           │
│  ├─ Pose Viewer                            │
│  └─ Export                                 │
│          │                                 │
│          ├─ HTTP API Client ───────────────┼── FastAPI Server
│          │                                 │
│          └─ Tauri Commands                 │
│              ├─ Capture                    │
│              ├─ File Dialog                │
│              ├─ Global Shortcut            │
│              ├─ Secure Storage             │
│              └─ File Save                  │
└────────────────────────────────────────────┘
```

---

## 2. 권장 기술 구성

### Frontend

- React + TypeScript
- Vite
- TanStack Query
- Zustand
- React Hook Form
- Zod
- React Router
- Lucide React

### Desktop

- Tauri
- Rust
- Tauri plugin 또는 운영체제 API는 필요한 범위만 사용

### 3D Viewer

초기 선택 기준:

- 서버가 렌더 이미지를 준다면 이미지 후보 뷰어로 MVP 시작
- 서버가 BVH + 기준 캐릭터를 준다면 Three.js 기반 뷰어 검토
- 3D 로딩 성능과 리타게팅이 불확실한 상태에서 먼저 Three.js를 앱 전체에 결합하지 않는다.

---

## 3. 권장 레포 구조

```text
standin-desktop/
├─ CLAUDE.md
├─ README.md
├─ docs/
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  ├─ providers.tsx
│  │  └─ queryClient.ts
│  ├─ features/
│  │  ├─ auth/
│  │  │  ├─ api/
│  │  │  ├─ components/
│  │  │  ├─ hooks/
│  │  │  ├─ pages/
│  │  │  ├─ schemas/
│  │  │  └─ types.ts
│  │  ├─ capture/
│  │  ├─ upload/
│  │  ├─ analysis/
│  │  ├─ pose-viewer/
│  │  ├─ export/
│  │  └─ settings/
│  ├─ shared/
│  │  ├─ api/
│  │  │  ├─ client.ts
│  │  │  ├─ errors.ts
│  │  │  └─ endpoints.ts
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ lib/
│  │  ├─ stores/
│  │  ├─ styles/
│  │  └─ types/
│  ├─ assets/
│  └─ main.tsx
├─ src-tauri/
│  ├─ capabilities/
│  ├─ icons/
│  ├─ src/
│  │  ├─ commands/
│  │  │  ├─ capture.rs
│  │  │  ├─ files.rs
│  │  │  ├─ shortcuts.rs
│  │  │  └─ storage.rs
│  │  ├─ platform/
│  │  │  ├─ windows.rs
│  │  │  ├─ macos.rs
│  │  │  └─ mod.rs
│  │  ├─ error.rs
│  │  ├─ lib.rs
│  │  └─ main.rs
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ .env.example
├─ package.json
└─ lockfile
```

---

## 4. 계층 책임

### `app/`

- 라우터
- 전역 Provider
- 앱 셸
- 인증 가드
- 전역 오류 경계

### `features/`

사용자 기능 단위의 UI, hook, schema, API adapter를 소유한다.

### `shared/api/`

- HTTP client
- 인증 헤더
- 공통 오류 정규화
- base URL
- 응답 파싱

### `shared/components/`

Button, Input, Modal, Toast, AppShell처럼 도메인에 종속되지 않는 UI만 둔다.

### `src-tauri/commands/`

React가 호출할 수 있는 작은 command만 둔다.

예:

```text
capture_region
open_file_picker
save_pose_file
register_capture_shortcut
get_secure_token
set_secure_token
```

현재 구현된 command:

```text
grab_screen                    (commands/capture.rs)
default_save_dir               (commands/export.rs)
choose_save_folder
save_pose_file
reveal_in_folder
register_capture_shortcut      (commands/shortcuts.rs, ADR-007)
unregister_capture_shortcut
focus_main_window
```

`register_capture_shortcut`의 핸들러는 프론트로 `shortcut://capture` 이벤트를 emit한다. 자체 command와 이벤트 수신은 capability 추가가 필요 없어 `capabilities/default.json`은 그대로다(docs/11 §3).

---

## 5. 데이터 흐름

### 서버 상태

TanStack Query:

- 현재 사용자
- 분석 Job
- 후보 목록
- 내보내기 메타데이터

### 클라이언트 상태

Zustand:

- 사이드바 상태
- 현재 캡처 초안
- 선택한 후보 ID
- 사용자 설정
- 단축키 표시 상태

### 로컬 컴포넌트 상태

- 모달 열림
- 드래그 오버
- 탭
- 폼 필드

서버 데이터를 Zustand에 복제하지 않는다.

---

## 6. 인증 토큰 저장

권장 순서:

1. OS 보안 저장소 또는 검증된 secure storage plugin
2. 접근 토큰은 메모리
3. refresh token만 보안 저장소
4. 일반 localStorage에 장기 토큰 저장 금지

서버 인증 방식이 확정되기 전까지 `AuthStorage` 인터페이스를 둔다.

```ts
interface AuthStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}
```

---

## 7. Mock과 실제 API 분리

```text
features/auth/api/
├─ auth.contract.ts
├─ auth.http.ts
├─ auth.mock.ts
└─ auth.service.ts
```

환경변수:

```text
VITE_API_BASE_URL=
VITE_USE_MOCK_API=true
```

UI는 mock인지 HTTP인지 알 필요가 없어야 한다.

---

## 8. 분석 Job 구조

서버 분석은 동기 요청보다 Job 모델을 권장한다.

```text
POST /v1/analysis/jobs
→ jobId 반환

GET /v1/analysis/jobs/:jobId
→ queued | uploading | preprocessing | detecting | skeleton
  | pose_search | rendering | completed | failed | cancelled

GET /v1/analysis/jobs/:jobId/result
→ candidates
```

status enum과 엔드포인트 경로의 단일 정본은 `docs/08_API_CONTRACT.md`다. 이 문서는 요약이며, 충돌 시 08 문서를 따른다.

진행 방식은 서버와 협의해 아래 중 선택한다.

1. Polling: MVP 권장
2. Server-Sent Events
3. WebSocket

초기에는 1~2초 Polling으로 충분하다.

---

## 9. 오류 경계

오류를 네 종류로 정규화한다.

```ts
type AppError =
  | { kind: "network"; message: string; retryable: true }
  | { kind: "auth"; message: string; retryable: false }
  | { kind: "validation"; message: string; fields?: Record<string, string> }
  | { kind: "native"; message: string; code?: string; retryable: boolean };
```

Rust 문자열 오류를 그대로 사용자에게 보여주지 않는다.

---

## 10. 결정이 필요한 ADR

`docs/adr/`에 기록한다. 현재 모두 초안(제안됨) 상태이며 팀 합의 후 승인으로 전환한다.

- [ADR-001 스타일링 방식](adr/ADR-001-styling.md)
- [ADR-002 인증 토큰 저장 방식](adr/ADR-002-auth-token-storage.md)
- [ADR-003 캡처 구현 방식](adr/ADR-003-capture-implementation.md)
- [ADR-004 분석 상태 전달 방식](adr/ADR-004-analysis-status-delivery.md)
- [ADR-005 3D 뷰어 도입 시점](adr/ADR-005-3d-viewer-timing.md)
- [ADR-006 BVH 다운로드 방식](adr/ADR-006-bvh-download.md)
