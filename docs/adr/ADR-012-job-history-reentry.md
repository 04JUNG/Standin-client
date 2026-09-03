# ADR-012: 작업 기록에서 지난 분석으로 다시 들어가는 방식

- 상태: 제안됨
- 날짜: 2026-08-29
- 관련 문서: docs/08_API_CONTRACT.md, docs/09_STATE_AND_DATA_MODEL.md §5·§6, docs/adr/ADR-008-window-modes.md, docs/adr/ADR-009-pose-file-delivery.md, docs/adr/ADR-011-signing-and-update-delivery.md

## 배경

작업 기록 목록에서 지난 작업을 눌러 후보를 다시 보고, 다른 후보를 골라 포즈 파일을 다시 저장할 수 있어야 한다. 그런데 지금의 후보 화면은 **원본 파일이 손에 있어야** 동작한다.

- 라우트 `/app/jobs/:jobId`의 `:jobId`는 `InputPreviewPage`·`BarProgressPage`가 만든 `crypto.randomUUID()`다. 서버 Job이 생기기 **전에** 필요하므로 클라이언트가 발급한다.
- `useAnalysisResult`는 `uploadStore.draft.file`이 있어야 `enabled`가 되고, `poseService.analyze()`가 업로드·폴링·변환을 한 번에 한다.
- 실제 서버 jobId는 `analyze()` 안에서만 알 수 있고 `AnalysisResult.jobId`로 나온다.

즉 기록의 항목을 눌러 이 화면에 보내면 지금 구조로는 아무것도 열리지 않는다.

한편 후보 화면 주변에는 되돌리기 어려운 장치들이 이미 붙어 있다.

- `pose.http.ts`의 `serverJobByClientJob` 맵. 창을 최소화하면 라우트가 `/app/jobs/:id` → `/bar/candidates`로 바뀌며(ADR-008) 쿼리가 취소·재실행되는데, 그때마다 Job을 새로 만들면 **사용자가 자기 분석 때문에 `CONCURRENCY_LIMIT`에 막힌다.** 이 맵이 그 버그의 수정이다.
- `useSaveFlow`가 `qc.getQueryData(poseQueryKeys.result(routeJobId))`로 결과를 캐시에서 직접 읽는다.
- `modeRoutes`가 라우트 문자열로 앱↔바 단계를 양방향 매핑한다.

## 선택지

- **A. `PoseResultService`에 `loadResult(serverJobId)`를 더하고 `useAnalysisResult`를 분기.** 기록에서 들어올 때는 저장된 결과만 읽는다.
- **B. 별도 라우트 `/app/history/:jobId`와 별도 훅.** 라이브 흐름을 전혀 건드리지 않는다.
- **C. 라우트 `:jobId`를 서버 jobId로 통일.** 개념적으로 가장 깔끔하다.

## 결정

**A를 채택한다. 그리고 기록에서 상세로 갈 때 서버 jobId를 라우트 jobId로 그대로 쓴다** (`navigate("/app/jobs/job_...")`).

두 종류의 id가 같은 라우트를 공유하고, **`job_` 접두사 하나로 갈린다**(`isServerJobId`). BFF가 `job_${randomUUID()}`로 발급하고(app-server `jobs/store.ts`의 `insertJob`) 클라이언트가 만드는 쪽은 접두사가 없으므로 두 흐름은 겹치지 않는다.

라우트를 나누지 않은 덕분에 다음이 **코드 변경 없이** 성립한다.

| 기존 장치 | 기록 진입 시 |
|---|---|
| `poseQueryKeys.result(jobId)` | 서버 jobId가 유효한 유니크 키 |
| `useSaveFlow`의 캐시 조회 | 같은 키라 찾아진다 → 재저장 성립 |
| `useSelectionReview` → `useRefineSelection` | refine은 서버 DB 컨텍스트만 필요 |
| `barRouteForAppPath` | 매치 → 기록 상세에서도 바 전환 가능 |

### 불변식

1. **`restoreOnly`(= `isServerJobId(jobId)`) 판정은 `draft.file` 유무보다 반드시 우선한다.** 이미지 A를 분석해 draft가 살아 있는 상태에서 기록의 Job B를 열 때, 파일을 먼저 보는 분기는 A의 파일로 B의 쿼리 키 아래 새 분석을 시작한다 — 쿼터 1회를 깎고 동시 분석 슬롯까지 잡는다. 라이브 흐름의 라우트 jobId는 절대 `job_` 접두를 갖지 않으므로 이 우선순위가 라이브 경로를 가로채는 일은 없다.
2. **`loadResult` 경로는 `serverJobByClientJob` 맵을 건드리지 않는다.** 기록을 열어보는 일이 분석 한도를 깎으면 안 된다.
3. **기록 쿼리의 루트 키는 `["jobHistory"]`이고 `["analysis"]` 밖에 있다.** `AppUpdateSection`이 `useIsFetching({queryKey: poseQueryKeys.all})`로 분석 진행 여부를 판정해 앱 업데이트 설치를 미룬다(ADR-011). 기록 조회가 그 아래 들어가면 목록을 볼 때마다 업데이트 버튼이 비활성이 된다.
4. **기록에서 다시 본 결과는 `results_viewed`로, 기록 조회 실패는 `analysis_failed`로 세지 않는다.** 같이 세면 분석 퍼널 지표가 부풀려진다.

### B를 기각한 이유

침습도는 가장 낮지만, 재저장까지 지원하려면 후보 그리드·확인 화면·저장까지 **세 벌을 복제**해야 한다. 특히 `useSaveFlow`가 라우트 jobId로 캐시를 읽으므로 키를 통일하지 않으면 저장이 아예 동작하지 않는다. 앱에서 가장 정교한 부분을 통째로 복제하는 안이다.

### C를 기각한 이유

라우트 jobId를 서버 id로 통일하려면 `InputPreviewPage`에서 먼저 POST를 쳐야 하고, 그 순간 `serverJobByClientJob` 맵의 존재 이유가 사라지면서 위 `CONCURRENCY_LIMIT` 버그가 되살아날 자리가 생긴다. 업로드 실패 시 서버 Job만 만들어져 쿼터가 새는 경로도 새로 열린다. 핵심 흐름 전체를 흔드는 데 비해 얻는 것은 개념적 일관성뿐이다.

## 결과

- 후보 화면 하나가 두 흐름을 모두 담당한다. 상단 배너로 "이전 분석 결과"임을 밝힌다.
- 원본 미리보기는 draft의 blob URL → 서버 presigned `inputUrl` → "보관 기간(90일)이 지났습니다" 순으로 떨어진다.
- 서버가 단일 진실 공급원이다. 로컬 기록 캐시를 두지 않으므로 오프라인에서는 목록이 비는 것이 아니라 오류와 재시도를 보여준다 — 빈 목록은 "작업이 지워졌다"로 읽힌다.
- `job_` 접두는 이제 **두 저장소가 공유하는 계약**이다. BFF가 Job id 형식을 바꾸면 클라이언트의 분기가 조용히 라이브 경로로 떨어진다. 서버 쪽 `insertJob`에 이 사실을 주석으로 남긴다.

## 후속

- rerun(`POST /v1/analysis/jobs/:id/rerun`)은 서버가 아직 501이다. 기록에서 재분석은 범위 밖이다.
- 원본 파일명을 보관하는 컬럼이 서버에 없어, 기록에서 저장하면 기본 파일명이 된다.
