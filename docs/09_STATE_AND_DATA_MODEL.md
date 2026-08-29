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

/**
 * ⚠ 실제 계약은 아래 4개뿐이다. BFF가 동기 추론을 감싸므로 세분 단계를 알 수 없다.
 * 나머지는 서버가 단계 정보를 주게 되면 열릴 목표값이다(docs/08 §5).
 */
type AnalysisStage = "queued" | "running" | "completed" | "failed";

/** 미구현. 서버가 세분 단계를 제공하면 위 타입에 합류한다. */
type PlannedAnalysisStage =
  | "uploading"
  | "preprocessing"
  | "detecting"
  | "skeleton"
  | "pose_search"
  | "rendering"
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

/**
 * ⚠ 아래는 **단인 컷을 전제한 초기 형태**다. 실제 구현은 다인 컷을 지원하도록
 * `people: PersonResult[]` 구조이며, 인물마다 스켈레톤 품질·폴백 상태를 함께 갖는다.
 * 정본은 `features/pose-viewer/api/pose.contract.ts`다.
 *
 * `inputPreviewUrl`은 optional이다 — 라이브 분석에서는 draft의 blob URL을, 작업 기록에서
 * 열었을 때는 서버가 준 presigned URL을 쓰고, 보관 기간이 지났으면 없다(ADR-012).
 */
type AnalysisResult = {
  jobId: string;
  inputPreviewUrl?: string;
  people: PersonResult[];
  capabilities: { refine: boolean };
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

## 4-1-1. 투어 상태 (`shared/stores/tourStore.ts`)

앱 사용법 투어도 같은 이유로 `shared/stores`에 둔다 — 상단 앱 바(`shared/components/AppShell`)의 다시 보기 버튼이 읽어야 한다.

```ts
type TourState = {
  active: boolean;              // 지금 떠 있는가
  acknowledged: TourStepId[];   // '다음'으로 넘긴 설명 스텝
  completedAt: string | null;   // 끝까지 본 시각(ISO)
  dismissedAt: string | null;   // 중간에 그만둔 시각(ISO)
};
```

`completedAt`·`dismissedAt`만 영속화한다(`standin-tour`, version 1). 진행 중 상태는 영속하지 않는다 — 투어를 다시 켜면 언제나 처음부터다.

**활성 스텝은 store에 두지 않는다.** 현재 라우트와 앱 상태에서 파생한다(`features/tour/lib/resolveActiveStep.ts`). 순번을 들고 있으면 캡처 취소·'다시 선택'·분석 실패처럼 흐름을 거스르는 경우마다 복구 코드가 따로 필요해진다. 사용자가 직접 해야 하는 스텝은 "지금 끝났는가"를 매번 화면 상태로 판정하므로, 조건이 풀리면 그 스텝이 저절로 다시 할 일이 된다.

화면 하위 상태(분석 중·실패·저장 완료)는 각 화면의 내부 state를 store로 끌어올리지 않고 `data-tour` 앵커가 지금 떠 있는지로 판정한다.

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

## 5. 작업 기록

**서버가 단일 진실 공급원이다. 로컬 캐시를 두지 않는다.**

`GET /v1/analysis/jobs`(커서 페이지네이션)로 목록을, `GET /v1/analysis/jobs/{jobId}/result`로 저장된 결과를, `GET /v1/analysis/jobs/{jobId}/selections`로 그때의 확정 선택을 읽는다. 삭제는 `DELETE /v1/analysis/jobs/{jobId}`다(docs/08 §4-1~4-3).

```ts
type JobHistoryItem = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorCode: string | null;
  source: string | null;
  personCount: number;
  selectionCount: number;
  hasSelection: boolean;
  /** 매칭된 포즈 후보의 썸네일 경로. 입력 러프가 아니다. */
  thumbnailUrl: string | null;
  /** 원본이 아직 서버에 있는가(90일 보관). */
  inputAvailable: boolean;
  inputWidth: number | null;
  inputHeight: number | null;
};
```

로컬 캐시를 두지 않은 것은 동기화·정합성 코드를 늘리지 않기 위해서다. 대신 오프라인에서는 **목록을 비워 두지 않고 오류와 재시도를 보여준다** — 빈 목록은 "작업이 지워졌다"로 읽힌다.

상세 재진입 설계는 ADR-012에 있다. 요점은 기록에서 상세로 갈 때 **서버 jobId를 라우트 jobId로 그대로 쓰고**, 두 흐름을 `job_` 접두사로 가른다는 것이다.

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
  // ⚠ 작업 기록은 ["analysis"] 밖이다. 아래 이유 참고.
  jobHistory: {
    list: () => ["jobHistory", "list"] as const,
    selections: (id: string) => ["jobHistory", "selections", id] as const,
  },
};
```

문자열 query key를 화면마다 임의로 만들지 않는다.

**작업 기록의 루트 키를 `["analysis"]`와 분리하는 이유:** `AppUpdateSection`이 `useIsFetching({ queryKey: poseQueryKeys.all })`로 "분석이 도는 중"을 판정해 앱 업데이트 설치를 미룬다(ADR-011). 기록 조회를 `["analysis", ...]` 아래 두면 목록을 불러올 때마다 분석 중으로 오인돼 업데이트 버튼이 계속 비활성이 된다. 즉 `["analysis"]` prefix는 단순한 이름이 아니라 **"지금 분석이 돈다"는 신호**다.

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
