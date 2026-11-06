# 실제 분석 로딩 UI 구현

2026-11-06에 승인한 6단계 모션을 클라이언트의 실제 앱/플로팅 바 페이지에 연결했다.

## 분리된 작업

- 구현: `/Users/dowon/.codex/worktrees/pose-search-loading-client/Standin-client`, `codex/pose-search-loading-client`, base `5fe483e9`.
- 기존 시안: `/Users/dowon/.codex/worktrees/pose-search-film-loading/Standin-client`에 보존했다. 승인한 50개 파일을 동일 base의 새 worktree에 복사하고 SHA256으로 대조했다.
- BFF: `/private/tmp/standin-pose-progress-bff`, `codex/pose-analysis-progress-v1`, 최신 커밋 `4a75f7a`.
- 추론 producer: `/Users/dowon/.codex/worktrees/eef0/Standin-server`, `codex/pose-analysis-progress-producer`, 최신 커밋 `a52feeb11`.
- BFF/producer의 전체 동반 변경은 [공유 계약](POSE_ANALYSIS_PROGRESS_V1.md)에 기록돼 있다. 위 최신 커밋 하나만으로 전체 기능이 구성된다는 의미는 아니다. 원격 merge/deploy는 하지 않았다.

## 실제 화면의 흐름

`pose.http → useAnalysisResult의 Job별 Query cache → PoseViewerPage / BarCandidatesPage → PoseSearchPending`에서 기존 polling의 실제 snapshot을 표시한다. 일반 앱과 360px 바가 같은 상태와 모션을 사용한다. 실제 러프, 주요 관절, 한 명의 다인원 focus, 동작 키워드와 컷 정보, 실제 후보, 명시적 refine 결과를 표시하며 누락 데이터는 일반 로딩으로 처리한다.

04번은 5장 fan → 여러 장이 동시에 흐르는 한 방향 리본이다. 05번의 입력/광택 효과는 실제 running/improved일 때만 나타난다. 최종 결과가 도착해야 100%가 되며, Top5는 즉시 마운트/선택 가능하고 outgoing 레이어만 760ms 동안 움직인다. 연출을 마치기 위해 결과를 기다리게 하지 않는다.

새 페이지 통합 검사에서 앱↔바 전환 중 마지막 observer가 사라질 때 live 조회가 취소되고 재시작되는 문제를 발견해 수정했다. live 조회는 Query cache entry 수명에 묶고, 화면 전환 동안 유지한다. 해당 cache가 제거되면 요청을 중단하고 늦은 progress가 cache를 되살리지 못하도록 막는다. 기록 GET은 기존 Query signal을 사용하고 HTTP의 3분 deadline은 유지한다.

## 검증과 확인 범위

- 관련 API/parser/geometry/motion/hook/실제 페이지 회귀 검사 161개, TypeScript/production build/lint 통과. lint는 기존 BodyCandidates hot-refresh 경고 1개이며 오류는 없다.
- 실제 `PoseViewerPage`와 `BarCandidatesPage`, Query cache, 선택 store, 로딩·결과·후보 UI를 함께 마운트해 진행 수신, 앱↔바 왕복, 단일 분석 호출, 100% outgoing과 즉시 후보 선택을 검증했다. 테스트의 서버 응답과 native shell/model picker는 대역이며 live 분석이나 OS 창 동작 검증과 구별한다.
- 실제 producer→BFF 공개 allowlist를 거친 OFFLINE snapshot 117건을 새 worktree의 production parser로 검증했다. focus/scene 손실 여부도 대조했다.
- 로컬 UI 미리보기는 `npm run dev -- --host 127.0.0.1 --port 1437`, `/loading-preview.html`이다. 예시 데이터이며 production build에는 포함하지 않는다. 실제 앱 코드는 이 DEV entry와 같은 컴포넌트를 사용한다.
- 1280px 앱, 462px 패널, 360px 바와 라이트/다크를 브라우저에서 확인했다. Windows/Tauri native와 배포 환경은 검증 범위 밖이다.

## 연동 시 실제 동작

현재 image analyze는 자동 refine를 실행하지 않아 해당 단계는 skipped다. 서버가 실제 refine 데이터를 제공하기 전에는 UI가 관절 변화를 만들지 않는다. 중간 후보가 준비되지 않았거나 polling 사이에 빠른 단계가 지나가면 그 연출은 생략될 수 있다. 동반 BFF/producer 변경을 반영하지 않은 서버에서는 일반 로딩 fallback이 동작한다.

다음 연동은 각 분리 브랜치를 검토해 반영한 뒤 live Job에서 공개 진행 정보와 최종 결과가 도착하는 시점을 확인하는 것이다.
