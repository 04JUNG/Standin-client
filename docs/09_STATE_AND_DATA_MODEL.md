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
