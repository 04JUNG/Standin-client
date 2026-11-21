# 실제 분석 진행 UI — v1 구현 계약

## 역할과 실행 순서

- 클라이언트: 기존 분리 워크트리 `codex/pose-search-film-loading`에서 구현. 6단계 실제 데이터 시각화, 기존 Job polling 확장, 앱/바 공통 캐시, DEV replay, 검증을 담당한다.
- BFF 세션: 별도 BFF worktree에서 snapshot 저장/조회, 공개 데이터 축약/번역, 추론 중간 결과 연결을 담당한다. 실제 producer가 필요하면 추론 서버도 별도 worktree에서 계측한다. 완료 후 결과만 쪼개서 실시간인 것처럼 보내지 않는다.
- 공통 계약을 먼저 고정 → 양쪽 구현 → 계약 fixture 대조 → 로컬 통합 검증. 배포/머지는 이 작업의 완료 조건이 아니다.

## 전송

기존 `GET /v1/analysis/jobs/:id` 응답에 optional `progress`를 추가한다. 기존 status와 terminal result/error가 우선한다. `/result`와 기존 선택/refine/export 권한은 바꾸지 않는다. 클라이언트는 기존 polling을 재사용한다. SSE는 후속 선택지이며 v1 필수가 아니다.

```ts
type Stage = 'analyzing' | 'extracting' | 'understanding' | 'searching' | 'refining' | 'ranking';
type Overlay = {
  format: 'coco17';
  coordinateSpace: 'image-normalized';
  // 원본 이미지 전체 기준 [0,1] 좌표. crop-local 좌표를 그대로 보내지 않는다.
  // 가려지거나 검증되지 않은 관절은 null. 순서는 COCO17.
  points: ([number, number] | null)[]; // 정확히 17개
};
type CandidatePreview = { id: string; rank: number; thumbnailUrl: string };
type Progress = {
  version: 'pose-analysis-progress.v1';
  sequence: number; // Job 안에서 단조 증가, snapshot은 누적 전체 상태
  stage: Stage;
  updatedAt: string; // ISO8601
  completedStages: Stage[]; // 실제 완료한 단계만. 순서로 추측하지 않는다.
  skippedStages: Stage[]; // 실행하지 않은 단계. 완료와 구별한다.
  activePersonIndex?: number;
  // 실제 VLM이 관측한 컷 전체 정보. 대표 인물의 태그/최종 인물 수와 혼동하지 않는다.
  scene?: {
    shot?: 'full_half' | 'bust' | 'face';
    view?: 'front' | 'side' | 'back' | 'three_quarter';
    personCount?: number; // 정수 0..20. 미확정 people.length/focus로 계산하지 않는다.
  };
  // 최종 인물 순서 확정 전 실제 관측 1명. id는 Job 내 임시 관측 ID이며 personIndex/candidateId가 아니다.
  focus?: {
    id: string;
    skeleton: Overlay;
    // 동일 슬롯 객체 참조로 연결된 기존 실제 관측/검색 실행만. 불명확하면 생략.
    observations?: { id: string; label: string }[];
    searchMode?: 'pose' | 'description' | 'combined' | 'upper_body';
  };
  people: {
    personIndex: number;
    skeleton?: Overlay;
    observations?: { id: string; label: string }[];
    // 실제 실행 경로만 번역한다. 관측 태그와 검색 조건을 혼동하지 않는다.
    searchMode?: 'pose' | 'description' | 'combined' | 'upper_body';
    candidates?: CandidatePreview[];
    refinement?: {
      candidateId: string;
      status: 'running' | 'improved' | 'unchanged' | 'reverted' | 'skipped';
      // 실제 실행이 명시한 COCO17 몸 관절 5..16만, 중복 없이 최대 12개. 없으면 생략.
      activeJoints?: number[];
      // 실제 후보의 투영 좌표/이미지만. before/after는 같은 좌표계와 카메라.
      before?: Overlay;
      after?: Overlay;
      beforeThumbnailUrl?: string;
      afterThumbnailUrl?: string;
    };
  }[];
};
```

`progress`는 running 동안 제공한다. 각 단계의 데이터가 아직 없으면 해당 필드를 생략한다. 빈 observation/candidate를 가짜 데이터로 채우지 않는다. server stage가 늦게 도착하거나 병렬 작업이 끝나는 순서가 바뀌어도 sequence가 우선한다. 폴링 사이 빠른 단계가 지나갈 수 있어 completed/skipped와 누적 payload를 유지한다. 별도의 연출 대기열로 최종 결과를 지연시키지 않는다.

## 표시 원칙

1. 실제 업로드 러프를 계속 사용한다. 원본 이미지 크기/종횡비 그대로 정렬한다.
2. 얼굴 세부 관절은 생략하고 어깨/팔꿈치/손목/골반/무릎/발목만 표시한다. 양 끝점이 검증된 선만 그린다. 누락 관절을 보간해 관측된 것처럼 표시하지 않는다.
3. observations는 BFF가 관측 필드를 짧은 한국어로 번역한 결과다. 최대 8개, 길이 제한, stable id. VLM의 raw prompt/reasoning/log/private context를 공개하지 않는다. 클라이언트가 동작을 추측하거나 추가 AI 호출하지 않는다. 키워드는 나타났다 위로 사라지는 모션이며 데이터 변경 때만 새 묶음을 재생한다.
4. 중간 후보는 read-only preview다. rank/이미지만 표시하며 선택/refine/export 권한이 없다. 실제 썸네일이 없으면 조용한 준비 상태를 사용한다. 로딩 연출용 렌더/생성 호출을 추가하지 않는다.
5. refine가 실행된 경우에만 running을 표시한다. 실제 before/after가 있을 때만 보간/크로스페이드한다. unchanged/reverted/skipped는 원본 유지/생략 문구로 구별한다. 선택 후보 후행 refine는 이 계약만으로 자동 실행하지 않는다.
6. ranking은 실제 후보 rank를 반영한다. completed가 도착하면 즉시 기존 결과 화면으로 전환한다.

표시명: 러프 확인 / 자세 읽기 / 동작 이해 / 포즈 찾기 / 러프 맞춤 / 후보 정리.
경로 문구: pose → 자세가 비슷한 포즈를 찾고 있어요, description → 동작의 특징을 살펴보고 있어요, combined → 자세와 동작을 함께 비교하고 있어요, upper_body → 보이는 상체를 중심으로 비교하고 있어요.

퍼센트는 클라이언트 단계 기반 예상치이며 pending 중 100%를 표시하지 않는다. 실제 inference 진행률/신뢰도라고 주장하지 않는다. 구 서버에는 기존 queued/running/preparing과 optional stage fallback을 유지한다. malformed/unknown 버전은 분석 실패를 만들지 않고 일반 로딩으로 돌아간다. 동일/과거 sequence는 최신 유효 데이터를 덮어쓰지 않는다. 진행 데이터는 해당 Job에만 귀속된다.

## 검증 기준

- 6단계, 원본 좌표 정렬, 부분/누락 스켈레톤, 다중 인물, observation id 교체와 반복 polling, 실제 후보 순서, 모든 refine outcome.
- malformed/unknown version, 오래된 sequence, 진행 정보 없는 기존 서버, terminal 완료/실패 우선, 취소/앱↔바 이동 시 중복 Job 없음.
- producer가 아직 준비되지 않았으면 지원되는 실제 milestone만 내보내고 나머지는 생략한다. 어떤 단계가 실제로 연결됐는지 구현 결과에 명시한다.
- DEV preview는 production component/parser를 사용한다. 예시 데이터 재생임을 화면에 명시한다. 실제 서버 통합 여부와 구별한다.


## BFF/producer 구현 핸드오프 (2026-11-06)

- 최종 BFF worktree: `/Users/dowon/.codex/worktrees/eef0/Standin-app-server` (`codex/pose-analysis-progress-v1`, base `37adaa6`). 임시 `/private/tmp/standin-pose-progress-bff`에서 이 위치로 **이동 완료**했다.
- 추론 producer: `/Users/dowon/.codex/worktrees/eef0/Standin-server` (`codex/pose-analysis-progress-producer`, base `f23dfdd0f`). 원본 checkout 파일은 수정하지 않았다.
- BFF 상세 구현/실행 보고서: `/Users/dowon/.codex/worktrees/eef0/Standin-app-server/docs/POSE_ANALYSIS_PROGRESS_V1.md`.
- 추론 실제 단계별 연결 보고서: `/Users/dowon/.codex/worktrees/eef0/Standin-server/docs/POSE_ANALYSIS_PROGRESS_V1.md`.
- 공개 fixture: `/Users/dowon/.codex/worktrees/eef0/Standin-app-server/fixtures/analysis-progress/pipeline-v1.json` (오프라인 mock producer를 실제 BFF sanitizer에 통과시킨 1p/2p combined/description 및 혼합 pose+description).
- 추가 계약 fixture: 같은 디렉터리 `contract-cases-v1.json` (refine 5개 outcome의 **합성 parser 검증 전용**, 현재 분석 producer에서 발생했다고 주장하지 않음).
- raw allowlist producer fixture: `/Users/dowon/.codex/worktrees/eef0/Standin-server/tests/fixtures/analysis_progress/producer-v1.json`.
- 클라이언트 실제 parser를 읽기 전용으로 불러 39개 snapshot 통과를 확인했다. 재검증: BFF worktree에서 `node --import tsx scripts/check-progress-client.mts /Users/dowon/.codex/worktrees/pose-search-film-loading/Standin-client/src/features/pose-viewer/api/analysisProgress.ts`.
- BFF typecheck/build 및 전체 테스트: **983 passed, 2 existing opt-in skips**. producer: **121 passed, 3 existing Gemini adapter cases deselected** (로컬 QA 환경의 google-genai 미설치). 새 producer 테스트는 모두 통과했다.
- 실제 전송은 같은 `/analyze` 요청의 opt-in NDJSON이며 구 JSON 서버에서는 재호출 없이 기존 처리를 유지한다. BFF는 기존 owner-scoped GET에 running 중 optional progress만 더한다. DB source sequence/run/lease/status 조건과 bounded best-effort writer로 역순·중복·재시도·여러 worker·terminal 이후 업데이트를 막는다.
- multi-person payload는 crop 재시도 후 최종 인물 순서 확정 시 공개한다. 단일 인물은 검색 전 관절/관측/실행 경로가 전달된다. 전역 단계는 한 인물이라도 실제 실행 완료하면 completed를 우선하고 다른 인물의 skipped가 중복되지 않는다.
- 중간 후보는 기존 API asset/camera binding이 확정한 최종 ID/rank와 **이미 존재하는 정적 bundle thumbnail**만 사용한다. `/aligned`, `/poster`, `/lookup-thumbnail`, converter/render URL은 전달하지 않는다. 썸네일 없으면 생략한다.
- 현 image analyze 경로는 선택 후보 `/refine`를 실행하지 않으므로 **refining은 skipped**, before/after/running은 만들지 않는다. 기존 선택 후 refine/내보내기 권한은 유지한다. 추가 VLM/렌더/타이머 단계/완료 연출 지연은 없다.
- 클라이언트 소스는 수정하지 않았다. 이 문서에만 핸드오프를 추가했다. 로컬 API/BFF/클라 연결 절차는 BFF 보고서의 Local client integration을 따른다. 배포·머지·프로덕션 분석은 실행하지 않았다.

로컬 커밋: BFF `08b8545` / producer `3a7ab0d7f`. 두 구현 worktree의 변경 사항은 모두 커밋되어 있고 작업 트리는 clean이다. 공유 계약 문서의 이 핸드오프만 클라이언트 세션의 미커밋 문서 변경으로 남겼다.

## 클라이언트 구현 결과 (2026-11-06)

- 기존 분리 worktree `/Users/dowon/.codex/worktrees/pose-search-film-loading/Standin-client`, branch `codex/pose-search-film-loading`에서 구현했다.
- `api/analysisProgress.ts`가 공개 allowlist 계약을 검증하고, Job별 Query cache가 sequence/단계 진입 시각/진행률 하한을 보관한다. `/result` 대기와 terminal 처리에는 연출 지연을 넣지 않았다.
- 스켈레톤과 원본은 같은 contain/meet 좌표계를 사용한다. 키워드는 understanding 단계가 polling 사이에 지나갔어도 searching에서 도착 시 표시되며, 단계가 바뀌거나 같은 데이터가 반복돼도 다시 재생하지 않는다.
- 실제 준비된 이미지와 순서만 사용하는 read-only 카드, 실제 refine before/after 보간과 outcome 구분, 누락 데이터/구 서버 fallback, owner 인증 이미지와 blob 정리를 구현했다.
- BFF가 production sanitizer로 만든 39개 공개 snapshot(오프라인 mock pipeline 34개 + synthetic refine 계약 5개)을 클라이언트 production parser로 직접 읽어 모두 통과했다. 회귀 fixture는 `src/test/fixtures/analysis-progress/`에 보관했다. 이것은 실 모델 분석 품질/배포 연결의 증거가 아니다.
- DEV 미리보기: `http://127.0.0.1:1436/loading-preview.html`. 예시 데이터 재생임을 명시했다. 1280px 앱, 462px 패널, 360px 바, 라이트/다크, 후보 잘림/가로 넘침을 확인했다.
- 현재 `/analyze`가 실제 refine를 실행하지 않는 경로는 BFF producer가 skipped로 보낸다. 클라이언트가 이 기능을 자동으로 실행하지 않는다.


## BFF activeJoints optional 확장 (2026-11-06)

- 이전 BFF checkout이 제거되어 기존 전용 브랜치를 `/private/tmp/standin-pose-progress-bff`에 다시 열었다. 현재 BFF 보고서는 `/private/tmp/standin-pose-progress-bff/docs/POSE_ANALYSIS_PROGRESS_V1.md`이며, 기존 39개 공개 fixture도 이 root의 `fixtures/analysis-progress/`에 그대로 있다. 앞선 `eef0/Standin-app-server` 경로 안내는 현재 이 경로로 대체한다.
- BFF 타입과 공개 allowlist에 `refinement.activeJoints?: number[]`를 추가했다. 명시적인 유효 refinement record의 배열만 전달한다. COCO17 정수 5..16, 중복 없음, 최대 12개를 검증한다. 누락/오류 시 activeJoints만 생략하고 관절을 추정·보간·필터·중복 제거하여 만들지 않는다. 명시적인 빈 배열은 허용한다.
- 저장 후 공개 projection에서도 유효 배열을 보존하며 private refinement 필드는 제거한다. 기존 before/after/thumbnail producer 연결은 추가하지 않았다. 실제 running의 활성 관절과 improved 전후의 '바뀐 관절 위치'는 의미가 다르며 BFF가 좌표 차이로 activeJoints를 생성하지 않는다.
- `/analyze` auto-refine는 기존대로 skipped다. 새 refine 실행, 모델/VLM 호출, 렌더 요청은 추가하지 않았고 추론 producer 및 클라이언트 소스도 수정하지 않았다.
- `npm run test:progress`: 12 passed. 전체 BFF: 985 passed / 기존 opt-in 2 skipped. 기존 fixture 39개는 파일 변경 없이 클라이언트 production parser 통과를 재확인했다.


## BFF/producer 실제 multi-person focus 완료 (2026-11-06)

- Producer: `/Users/dowon/.codex/worktrees/eef0/Standin-server`, `codex/pose-analysis-progress-producer`, 커밋 `a436754d6`.
- BFF: `/private/tmp/standin-pose-progress-bff`, `codex/pose-analysis-progress-v1`, 커밋 `dde983c`.
- 다인원 crop/rescue/repair가 기존대로 끝난 직후, **routing/search 전에** 기존 validated mask를 적용한 한 슬롯의 원본 전체 이미지 정규화 COCO17 skeleton을 focus로 내보낸다. 가장 많은 검증된 몸 관절을 가진 슬롯 하나를 선택하지만 슬롯/최종 정렬/검색 판단은 바꾸지 않는다. invalid/suspect/missing/검증점 없음은 제외하며 적격 슬롯이 없으면 focus도 생략한다.
- `focus_<random>`은 요청 내 일시적 관측 ID다. personIndex/candidateId를 임의 할당하지 않는다. focus의 공개 필드는 id/skeleton과 선택적인 observations/searchMode뿐이다. 인물 번호/선택 권한/다른 인물의 태그를 섞지 않는다.
- Producer 내부의 **같은 슬롯 객체 참조**가 기존 semantic evidence 및 실제 검색 실행 scope와 연결될 때만 focus에 관측/실행 경로를 더한다. 같은 숫자 slot_id/가까운 사람/출력 인덱스로 추측하지 않는다. BFF는 people와 같은 고정 한국어 관측 번역/searchMode allowlist를 쓴다. 아직 연결된 정보가 없으면 생략한다.
- 최종 sorted people가 도착하면 producer가 focus를 제거한다. BFF 역시 nonempty people를 우선해 focus를 제거한다. 단일 인물 경로는 이전대로이며, 완료 후 늦은 metadata가 focus를 되살리지 않는다. owner/sequence/lease/terminal 조건은 유지했다.
- 기존 fixture 39개는 수정하지 않았다. 새 공개 fixture `/private/tmp/standin-pose-progress-bff/fixtures/analysis-progress/focus-v1.json`에 추가 39개 snapshot이 있다. `combined-2p`, `legacy-mixed-2p`는 extracting focus→동일 슬롯 관측/실행 경로→최종 people를 보여 주고, `description-2p`처럼 실제 검증 관절이 없는 경우는 focus를 만들지 않는다. 모든 fixture는 명시적으로 offline mock 검증용이며 live 분석 증거와 구별한다.
- 새 raw producer fixture: `/Users/dowon/.codex/worktrees/eef0/Standin-server/tests/fixtures/analysis_progress/focus-producer-v1.json`.
- 클라이언트 production parser로 기존 39 + 신규 39 = **78개 snapshot 통과**. focus가 제거되지 않고 그대로 파싱됨도 deep equality로 확인했다. BFF worktree에서 `node --import tsx scripts/check-progress-client.mts /Users/dowon/.codex/worktrees/pose-search-film-loading/Standin-client/src/features/pose-viewer/api/analysisProgress.ts`로 재검증할 수 있다.
- Producer는 실제 2인 pipeline을 Event로 routing 진입에서 막았을 때 search 전 focus snapshot을 관측하는 테스트, 최종 결과 동일성 및 VLM/pose/search 호출수 불변, 정확한 슬롯 참조만 연결되는 테스트를 추가했다. 선택된 회귀 테스트 **124 passed / 기존 Gemini 3건 제외(google-genai 미설치)**. BFF **987 passed / 기존 opt-in 2 skipped**, progress 계약 테스트 14건 통과.
- 추가 VLM/포즈 추정/렌더/검색/인위적 단계 타이머는 없다. auto-refine skipped 유지. 이 세션은 클라이언트 소스를 수정하지 않았으며 공유 문서만 갱신했다. 두 구현 worktree는 커밋 후 clean이다. 배포/머지/프로덕션 분석은 실행하지 않았다.

## 클라이언트 모션 개선 (2026-11-06)

- 02: 실제 COCO 좌표를 가진 인물 한 명에 집중하며 원본과 관절을 하나의 SVG viewBox로 확대한다. 최종 순서 미정인 다인원은 `focus`의 일시 관측 ID를 사용하고 '인물 분석 중'으로 표시한다. 최종 people가 준비되면 최종 인물 번호를 따른다. 서로 다른 인물의 관절/관측을 합치지 않는다.
- 03: 실제 받은 키워드가 떠올라 동작 특징 영역에 모인다. 나타나는 수는 수신된 특징 수이며 별도 검색 성공/정확도를 의미하지 않는다. 동일 데이터의 반복 polling은 모션을 다시 시작하지 않는다.
- 04: 실제 카드가 펼쳐진 뒤 같은 이미지들이 좌우로 흐른다. 후보를 복제하거나 새로운 렌더/생성/이미지 요청으로 연출하지 않는다.
- 05: optional activeJoints는 실행이 명시한 활성 조정 관절이다. 그 관절에만 입력 흐름을 표시한다. 실제 전후 좌표 차이는 '바뀐 관절 위치'로 구분하며 최적화 변수를 추측하지 않는다. 실제 전후 보간은 완료된 데이터 사이의 시각화다.
- 06: 실제 결과가 준비되면 100%와 완료 표식을 표시하고 결과 화면과 440ms 교차 전환한다. 결과 DOM과 선택 동작은 같은 render에서 바로 열린다. 460ms cleanup은 시각 레이어만 제거한다. query/refine/후보 선택/내보내기 작업에 완료 대기를 추가하지 않는다.


## BFF/producer scene 확장 완료 보고 (2026-11-06, append-only)

확정된 루트 확장:

```ts
scene?: {
  shot?: 'full_half' | 'bust' | 'face';
  view?: 'front' | 'side' | 'back' | 'three_quarter';
  personCount?: number; // 정수 0..20, 명시적 0도 보존
};
```

- Producer: `/Users/dowon/.codex/worktrees/eef0/Standin-server`, `codex/pose-analysis-progress-producer`, 로컬 커밋 `a52feeb11`.
- BFF: `/private/tmp/standin-pose-progress-bff`, `codex/pose-analysis-progress-v1`, 로컬 커밋 `4a75f7a`.
- 원본 VLM analyze 직후의 기존 extracting 이벤트를 scene으로 확장했다. 추가 호출/단계/이벤트 없이 이후 focus·people·최종 ranking snapshot에 누적 유지한다. 실제 pose가 시작되기 전 scene을 관측하는 테스트로 전달 시점을 확인했다.
- shot/view는 유효한 `stated_tags` 원본 관측만 사용한다. enum control 기본값(full_half/front 등), 대표 인물/focus의 시점을 전역 컷 관측으로 바꾸지 않는다.
- personCount는 원본 raw `num_people`가 숫자형 정수 0..20이며 기존 parsed VLM 분석 수와 일치할 때만 보낸다. 문자열/불리언/소수/범위 초과·clamp 결과/누락·박스 개수 fallback/수 불일치는 생략한다. people.length/focus로 수를 추정하지 않는다. raw 데이터 자체나 prompt/reasoning/dialogue/box는 공개하지 않는다.
- BFF는 shot/view/personCount를 필드별로 검증하며 없는/손상된 필드만 각각 생략한다. 전부 비어 있으면 scene 자체를 생략한다. 기존 owner/sequence/lease/terminal 조회와 결과/검색/후처리/정렬/권한은 그대로다. 자동 refine skipped 유지.
- 기존 78개 fixture는 **수정하지 않았다**. 새 공개 fixture는 `/private/tmp/standin-pose-progress-bff/fixtures/analysis-progress/scene-v1.json` (7가지 원본 VLM offline 입력, 39개 snapshot, 실제 producer→BFF sanitizer 결과). full_half/bust/face, 전역 시점과 다른 인물 시점, 명시적 0, 누락·잘못된 count/label, 필드별 유효값 생략/보존을 포함한다. 실제 서비스 분석 증거와 구분되는 명시적 offline mock fixture다.
- raw producer fixture: `/Users/dowon/.codex/worktrees/eef0/Standin-server/tests/fixtures/analysis_progress/scene-producer-v1.json`. 재생성: producer root에서 `python -m scripts.analysis_scene_fixture /tmp/pose-scene-producer.json`; BFF root에서 `node --import tsx scripts/progress-fixture.mts /tmp/pose-scene-producer.json fixtures/analysis-progress/scene-v1.json`.
- BFF root에서 `node --import tsx scripts/check-progress-client.mts /Users/dowon/.codex/worktrees/pose-search-film-loading/Standin-client/src/features/pose-viewer/api/analysisProgress.ts`로 기존 78 + scene 39 = **117개 snapshot**의 production parser 통과를 확인했다. scene deep equality 검사로 필드가 제거되지 않고 그대로 전달됨을 확인한다.
- BFF `npm run test:progress`: 15 passed. 전체 BFF `npm test`: **988 passed / 기존 opt-in 2 skipped**. 선택 producer 회귀 검사: **158 passed / 기존 Gemini adapter 3건 제외(로컬 google-genai 미설치)**. 관측 provenance, 필드별 손상 처리, 원본 count 검증, 누적/Job 분리, scene 전달 시점과 기존 최종 결과·VLM/pose/search 호출수 불변을 검증했다.
- 클라이언트 소스는 수정하지 않았고, 이 공유 문서는 이번 작업에서 append만 했다. 두 구현 worktree는 커밋 후 clean이다. 추가 모델/VLM/포즈/렌더/검색/인위적 단계 타이머, 원격 배포/머지/프로덕션 분석은 실행하지 않았다.

## 클라이언트 03–06 추가 모션 완료 (2026-11-06)

- root scene의 실제 shot/view/personCount만 컷·시점·인물 수로 번역한다. 컷 정보는 그림 밖에 남기고, 이미지 위 고정 '동작 특징' 배지를 제거했다. 기존 사람별 관측과 컷 관측은 구별되며, 같은 id+label은 재수신/단계 변경 시 다시 재생하지 않는다.
- 후보 5개의 실제 이미지 노드는 하나씩만 유지한다. fan 후 각 카드가 오른쪽→중앙→왼쪽으로만 흘러가며, 재배치는 보이지 않는 화면 밖에서 한다. 왕복/복제 이미지/추가 렌더를 사용하지 않는다.
- 실제 running/improved일 때만 관절 입력 효과와 작은 glint/빛 sweep을 함께 재생한다. unchanged/reverted/skipped에서 품질 향상을 암시하지 않는다.
- 실 결과는 즉시 마운트/선택 가능하고 100% outgoing은 pointer-events:none이다. 760ms transform/opacity + 36ms 카드 간격으로 handoff하며 820ms는 시각 레이어 정리만 한다. reduced-motion에는 해당 모션을 생략한다.
- 관련 클라이언트 검사 158개, 117개 BFF 공개 snapshot 호환 검사, typecheck/build/lint 오류 0개 통과. DEV의 러프/관절/후보/리파인은 예시 재생이며 live 모델 품질 검증과 구별한다. macOS 브라우저에서 1280px/360px 라이트·다크를 확인했고 Tauri/Windows/배포 통합 검증은 하지 않았다.
