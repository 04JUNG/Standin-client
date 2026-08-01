# 상태 및 데이터 모델

## 1. 상태 분류

### 서버 상태

TanStack Query:

- currentUser
- analysisJob
- analysisResult
- exportDownload

### 앱 전역 상태

Zustand:

- app shell
- capture draft
- current upload draft
- selected candidate
- preferences
- pending background job IDs

### 화면 로컬 상태

- dialog
- form
- hover
- active tab
- image zoom

---

## 2. 핵심 타입

```ts
type User = {
  id: string;
  email: string;
  displayName?: string;
};

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

type AnalysisStage =
  | "queued"
  | "uploading"
  | "preprocessing"
  | "detecting"
  | "skeleton"
  | "pose_search"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

type AnalysisJob = {
  id: string;
  status: AnalysisStage;
  stageLabel?: string;
  currentStep?: number;
  totalSteps?: number;
  createdAt: string;
  updatedAt: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

type MatchLevel = "high" | "medium" | "low";

type PoseCandidate = {
  id: string;
  rank: number;
  title: string;
  tags: string[];
  matchLevel: MatchLevel;
  thumbnailUrl: string;
  previewImages: Array<{
    view: string;
    url: string;
  }>;
  modelUrl?: string | null;
  bvhAvailable: boolean;
};

type AnalysisResult = {
  jobId: string;
  inputPreviewUrl: string;
  overlayImageUrl?: string;
  shotType?: "full" | "half" | "bust" | "face" | "unknown";
  personCount?: number;
  candidates: PoseCandidate[];
};

type ExportDraft = {
  candidateId: string;
  format: "bvh";
  fileName: string;
  destinationPath?: string;
};
```

`destinationPath`는 사용자가 저장할 때마다 정하는 값이 아니다. 설정의 기본 저장 폴더에서 채워지고, 저장 화면의 "다른 폴더에 저장"으로 이번 한 번만 덮어쓸 수 있다(ADR-009). 기본 저장 폴더 자체는 앱 데이터 디렉터리의 preference에 영속화한다(§5).

---

## 3. 캡처 Store

```ts
type CaptureState = {
  status: "idle" | "capturing" | "preview" | "error";
  draft: UploadDraft | null;
  error: string | null;
  beginCapture(): Promise<void>;
  useCapture(): void;
  discardCapture(): Promise<void>;
  reset(): void;
};
```

실제 command 호출은 service에 두고 store는 orchestration만 담당한다.

---

## 4. 선택 상태

후보 선택은 서버 상태와 분리한다.

```ts
type PoseSelectionState = {
  jobId: string | null;
  selectedCandidateId: string | null;
  selectCandidate(id: string): void;
  clearSelection(): void;
};
```

새 Job이 열릴 때 이전 선택을 초기화한다.

---

## 4-1. 단축키 Store

`shared/stores/shortcutStore.ts`에 둔다. features가 아니라 shared인 이유는 바인딩을 `shared/hooks`와 `shared/components`가 읽기 때문이다 — features에 두면 `shared → features` 역의존이 생긴다.

```ts
type ShortcutState = {
  bindings: Record<ShortcutId, Accelerator>;
  previousGlobal: Accelerator | null;   // 등록 실패 시 되돌릴 값
  globalStatus: "idle" | "registering" | "registered" | "failed" | "unavailable";
  globalError: string | null;
  cheatSheetOpen: boolean;
};
```

`bindings`만 영속화한다(`standin-shortcuts`, version 1). 키바인딩은 비밀정보가 아니라 localStorage로 충분하며 docs/06 §6의 토큰 저장 금지 대상이 아니다.

영속값은 항상 기본값과 병합한다. 레지스트리에 항목을 추가하면 기존 사용자의 영속값에는 그 키가 없기 때문이다. 아울러 레지스트리에 없는 id, 문자열이 아닌 값, 파싱 불가한 accelerator는 버리고 기본값으로 되돌린다(docs/11 §3).

`globalStatus`는 영속화하지 않는다 — 실행할 때마다 실제 등록 결과로 다시 정해져야 한다.

---

## 4-2. 창 모드와 흐름 시작점 (ADR-008)

**창 모드는 store에 두지 않는다.** 라우트에서 파생하므로 store에 두면 진실 공급원이 둘이 되고 "창은 56×56인데 화면은 홈" 같은 불일치가 가능해진다. `WindowModeSync`가 `useLocation`으로 모드와 크기를 계산해 네이티브에 반영한다.

`windowModeStore`(`shared` 아님, `features/bar/stores`)는 영속이 필요한 값만 갖는다.

```ts
type WindowModeState = {
  barPosition: { x: number; y: number } | null; // 사용자가 옮긴 바 자리
};
```

`standin-window` 키로 영속화한다. 손상된 값(숫자 아님·무한대)은 버리고, 사라진 모니터를 가리키는 좌표는 Rust가 작업 영역으로 클램프한다.

### 흐름 시작점

`uploadStore.origin`과 `captureStore.origin`이 `"app" | "bar"`를 갖는다. 진입 시점에 기록하고 이후 단계가 `flowOrigin`의 헬퍼로 목적지를 계산한다 — 각 단계가 개별 분기하지 않게 하기 위한 것이다.

---

## 5. 최근 작업

MVP 선택지:

### 로컬만

```ts
type RecentJobSummary = {
  jobId: string;
  inputThumbnailPath?: string;
  status: AnalysisStage;
  selectedCandidateId?: string;
  createdAt: string;
};
```

앱 데이터 디렉터리에 작은 JSON 또는 SQLite.

### 서버 기반

`GET /analysis/jobs`

초기에는 서버가 제공하지 않으면 최근 작업 섹션을 비워 두는 것이 안전하다.

---

## 6. Query Key

```ts
const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  analysis: {
    job: (id: string) => ["analysis", "job", id] as const,
    result: (id: string) => ["analysis", "result", id] as const,
  },
};
```

문자열 query key를 화면마다 임의로 만들지 않는다.

---

## 7. Job Polling

```ts
refetchInterval: (query) => {
  const status = query.state.data?.status;

  if (!status) return false;
  if (["completed", "failed", "cancelled"].includes(status)) return false;

  return 1500;
}
```

앱이 background일 때 polling 간격을 늘이는 것을 고려한다.

---

## 8. 상태 전이

```text
UploadDraft
→ creating job
→ AnalysisJob(queued)
→ AnalysisJob(processing)
→ AnalysisResult
→ selectedCandidateId
→ ExportDraft
→ saved
```

다음 상태로 넘어갈 때 이전 데이터 삭제 시점을 명확히 한다.

- 새 입력 시작: 기존 draft 제거 여부 확인
- 다시 검색: 원본 입력 유지
- 로그아웃: 사용자 관련 query와 최근 메모리 삭제
- 앱 종료: temp 파일 정리 정책 적용
