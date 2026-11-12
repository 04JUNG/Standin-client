# main → develop 공통 코드 동기화 (2026-11-13)

명시적 refspec fetch 기준 main `afd1b48a2e18a99a053044eb09af5620f05599c9`, develop `2c919b07efaf60a160afdb8c0224b0dd050421f5`. squash 이력의 ahead/behind 대신 tree/patch와 실제 기능을 비교했다. 전용 워크트리 `/private/tmp/standin-sync-20261113/Standin-client`, 브랜치 `codex/sync-main-develop-20261113`.

| 판정 | 기능 묶음 | 근거 |
|---|---|---|
| 반영 | #228 full 외 scope 기본 skin 제한/불가 사유/기본 skin 복구 | skinScope/SkinControl, CandidateAppearanceControls, controller/http, useFramedReview, 전체 화면 ReviewPage와 floating BarReviewPage·BarPersonCandidates, 회귀 |
| 반영 | #200 macOS 저장된 바 위치 복원 | 모니터 work area 확인 후 먼저 clamp, display 없으면 현재 위치 보존. identifier/채널 설정 변경 없음 |
| 이미 포함 | #223(main)/#224(develop) 모델 재사용·503 자동복구·binary v2, #218 Top5 없이 final skin 저장 | 중복 cherry-pick 없이 develop 구현 유지. 관련 회귀 전체 실행 |
| 환경별 유지 | package/lock·Cargo·tauri 버전, notes, release/CI workflows | 기존 staging/dev 앱 버전·채널·설치 식별자·서명·공증·서비스 주소 그대로 |
| 미반영(정책 경계) | acquisition/journey consent/store/campaign 패키징·analytics hooks·설정 UI/문서·production 수집 env | 새로운 광고·여정 동의/수집 흐름으로, 기존 staging 설치/리플레이 동의·수집 정책을 바꾸지 않도록 해당 전체 dependency를 제외 |
| 미반영(열린 PR) | 개인 FBX/CS3C·CSP 저장·Replay 등 | main에 없는 별도 PR 기능을 가져오지 않음 |
| 생략 | 과거 운영 승격 문서·설치 동의 screenshot | 이번 공통 runtime 동기화와 무관한 운영 기록 |

## 호환 및 검증

Converter → BFF → client 순서로 검토/병합한다. 신규 BFF는 unavailable skin 이유/outputScope를 sibling으로 전달한다. 구 BFF가 SKIN_DISABLED만 주더라도 client가 알고 있는 cropped scope로 기본 skin 복구를 안내한다. v1/v2 model/receipt·모델 재사용·503 polling 복구 계약은 기존 develop에 있으며 전체 회귀로 유지 여부를 확인했다.

이번 Node 22: typecheck/build 통과, 전체 vitest 216 files / 1,692 passed / 6 skipped. lint 오류0, 기존 fast-refresh 경고2. 양쪽 ReviewPage/BarReviewPage의 cropped skin 제한·복구는 컴포넌트/훅 회귀로 확인했다. 실제 desktop UI 조작·CSP·native 저장·Windows/macOS 서명 앱은 여기서 확인했다고 주장하지 않는다. Rust checks는 CI에서 확인하며 로컬 결과는 아래 별도로 기록한다.

main/develop 직접 변경·병합·배포·릴리스 없음. PR base는 develop.
