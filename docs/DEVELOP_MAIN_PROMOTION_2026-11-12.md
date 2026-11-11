# develop → main 승격 점검 · 2026-11-12

기준: main `89d82f94fa6df94e345d8bb96509a50b4b408caf`, develop `94c587d13296fa59e516c0e906a14310fe7cb78c`.

이전 승격이 squash로 쌓여 두 브랜치를 직접 merge하면 이미 운영 중인 코드까지 충돌한다. 마지막 main→develop 동기화 당시의 main `80a60993f92269cde6c11a2200b4b809ae9260c4`를 비교 기준으로 삼아 develop 변경과 main 전용 수정사항을 검토하고, 현재 main에서 분기한 승격 브랜치에 결과를 올렸다. develop/main 원본 브랜치는 수정하지 않았다.

- develop의 접근 복구, 실제 진행 표시, 선택/상시 preview, 새 체형·손·저장 및 RC4 capability 계약을 승격한다.
- main의 버전 0.2.9와 release notes를 유지한다. develop 0.2.3으로 내리지 않는다. 새 버전 태그/설치 파일 릴리스는 만들지 않는다.
- main의 macOS floating bar 복원, 광고 installer creative, 선택적 유입/방문 연결·동의 화면·분석 집계 배선을 보존한다.
- RC4는 BFF가 `capabilities.refineRelease`를 true로 보낼 때만 선택한다. 이번 production BFF는 이를 끈다.
- CI의 develop/mock·staging API/identifier 설정과 staging 전용 interactive preview opt-in은 production 배포 설정과 분리한다.

검증: CI와 같은 Node 22에서 1,576 passed, 5 skipped. typecheck/build/release:check 통과. ESLint error 0, 기존 fast refresh warning 2개. Windows/macOS 네이티브 실행과 실제 CSP 저장은 이번에 새로 수행하지 않았고 PR의 두 OS Rust checks로 확인한다.

## refine와 develop 전용 기능 최종 점검

| 항목 | 이번 production 승격 정책 |
|---|---|
| legacy refine | `REFINE_ENABLED=1`, `REFINE_V2_ENABLED=1` |
| 알고리즘/요청 기본값 | `v2.5.4`, `REFINE_DEFAULT_MODE=aggressive` |
| aggressive 안전 selector | `REFINE_V25_SELECTOR_ENABLED=1` |
| 제한 몸통 | `REFINE_V2_TORSO=0` |
| New Refine RC4 | inference/BFF/worker `REFINE_RELEASE_ENABLED=0` |
| v3 실험 | inference `REFINE_V3_MODE=off`, evidence OFF; BFF shadow OFF |
| staging 전용 배포 | scene worker, anatomy initializer/preset pin, interactive transport 준비는 staging guard를 유지 |

`services/refine_release`의 전용 worker 이미지에는 실행용 ON 기본값이 있지만, production inference 이미지나 BFF가 그 worker로 바뀌지 않는다. 전용 worker 생성/배포도 이번 PR 범위가 아니다. 신형 refine 코드는 포함하되 production에서 광고하거나 호출하지 않는다.

검사 시점 실제 production은 inference task revision 53, BFF revision 59, analysis-worker revision 25였다. `REFINE_ENABLED=1`/BFF 노출 true였고 RC4·v3 override는 없었다. 당시 inference 이미지의 legacy 버전은 v2.5.3이므로 **이 PR 병합·배포 전부터 live가 v2.5.4라고 해석하지 않는다**. 이 문서와 PR 생성은 배포 실행이 아니다.

전체 저장소 점검: server/BFF/client/infra에 승격할 코드가 있다. 랜딩 `04JUNG/Standin`의 develop 트리 `295790a4b4670995233befcba7dd775f2e667f42`는 이미 과거 main `cb2a74bdd6d078a7200ff4d7d3819521426c8144`에 포함돼 새 승격 PR이 필요 없다. `Standin-master-docs`, `demo-repository`에는 develop이 없다.
