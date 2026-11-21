# 실제 OpenAI 러프 연동 검증 · 2026-11-06

## 실행 조건

분리된 클라이언트/BFF/producer worktree와 loopback HTTP에서 검증했다. OpenAI `gpt-5-mini`만 사용했고 Gemini 키/생성 경로는 끈 상태였다. 등록된 HumanArt 모델, 원본 BVH 라이브러리와 동결 Blender 5.2.0/캐릭터를 사용했다. 라이브러리는 23,180포즈, 검색 가능 카메라 포즈는 5,784개였다. dense embedding은 사용하지 않았고 실제 geometry/lexical 경로를 검증했다.

사용자가 승인한 공개 QA 러프 두 장만 처리했다. 원본 그림·스크린샷·응답 전문·API 키·설치 토큰은 이 PR에 포함하지 않는다. API 비용이 발생한 실제 실행은 실패를 포함해 아래 세 건이다. 세 번째는 두 번째 그림의 로컬 설정 수정 후 재검증이며 새로운 그림은 전송하지 않았다.

| 실행 | 결과 | 해석/조치 |
| --- | --- | --- |
| 낙하/착지 샘플, 초기 producer | 실제 3인 인식, 대표 관절/컷 정보 수신. 설명 15초 timeout. BFF가 완료 로그 뒤에도 running 유지 | 기대 인원수로 응답을 고치지 않았다. 로컬 PGlite SELECT의 affectedRows=0 문제로 결과 저장이 조기 반환된 것을 수정하고 runner 회귀 검사를 추가했다. 이 실행을 성공으로 집계하지 않는다. |
| 2인 전신 샘플, develop producer | OpenAI 2인·설명 모두 성공, 실제 검색 후보가 있었으나 공개 후보 0 | 새 worktree에 상대 data/bvh 경로가 없어 preview binding이 실패했다. 동일 검증 라이브러리 경로를 연결하고 BVH API 바이트 SHA를 원본과 대조했다. 설명 budget은 로컬 설정에서 45초로 지정했다. |
| 같은 2인 샘플 재검증 | 약 93.8초에 completed/GET result 200. 인물별 후보 [0,5] | 후보 없음은 실제 검색 결과다. 후보 5개는 검증된 원본 BVH에 묶였다. 누락된 원본 poster/manifest 5쌍을 로컬 라이브러리에 추가한 뒤 이미지 5개·선택·앱↔바 왕복 유지까지 확인했다. 모델 재호출 없이 같은 완료 결과를 사용했다. |

## 단계별 증거와 한계

| 단계 | 실제 확인 | 확인 범위 |
| --- | --- | --- |
| 01 러프 | 선택한 실제 이미지와 실제 Job 진행 수신 | 브라우저/실제 HTTP |
| 02 자세 읽기 | 다인원 중 한 대표 인물의 실제 COCO17 주요 10관절. 정규화 좌표가 원본 러프와 겹침 | 브라우저와 공개 snapshot. 추출이 끝난 03 시점에 관절 데이터가 도착할 수도 있다. |
| 03 동작 이해 | 굽힌 무릎·모은 다리·올린 팔·앞으로 기운 상체, 전신·반신/3·4 시점/2명, combined 경로 | 실제 공개 snapshot/클라이언트 수신 기록. 카드 애니메이션은 같은 실제 컴포넌트의 회귀 검사도 통과했다. |
| 04 후보 | 최종 실제 후보 5개와 이미지·선택 확인 | 중간 후보 snapshot은 producer가 완료 직전에 생성해 750ms polling 사이에 지나갔다. 따라서 이번 live 실행에서 fan/ribbon 모션 자체를 검증했다고 주장하지 않는다. 모션·데이터 binding은 offline snapshot/컴포넌트 검사로 검증했다. |
| 05 리파인 | 현재 image analyze는 자동 refine 미실행 | 합성 관절·광택을 표시하지 않는다. 실제 refine 실행의 native 시각 검증은 범위 밖이며 running/improved/skipped 분기는 회귀 검사로 검증했다. |
| 06 결과 | 실제 completed 뒤 결과 5개 도착, 즉시 선택, 앱↔바 선택 유지 | 100% 및 760ms outgoing/즉시 상호작용은 페이지/전환 통합 검사 통과. 빠른 최종 모션의 프레임별 live 캡처는 하지 않았다. |

로딩 단계는 서버가 실제 데이터를 낼 때 표시한다. 6단계를 반드시 일정 시간씩 재생하지 않는다. 지연/누락 데이터는 일반 로딩을 유지하고 빠르게 끝난 단계는 생략할 수 있다. 이번 검증의 포스터는 원본 출처 검증을 통과한 기본 체형 참고 이미지이며 검색 시점·체형·최종 내보내기 정확도를 보증하는 자료가 아니다.

## 회귀 검사

- 최신 client develop 통합: 1,481 passed / opt-in 5 skipped, TypeScript/build/lint 통과(기존 및 DEV entry hot-refresh 경고만 존재).
- Node 26의 전역 Web Storage가 jsdom을 가로채는 기본 실행은 실패했다. `NODE_OPTIONS=--no-experimental-webstorage npm test -- --reporter=dot`로 전체 검사를 다시 실행해 통과했다.
- BFF 최신 develop 통합: build 포함 1,061 passed / 기존 opt-in 2 skipped. 공개 fixture 117개를 현재 production parser로 검증.
- Producer develop 이식: 관련 OpenAI/provider/budget/progress/focus/scene 검사 197 passed. 실모델 호출은 위 root QA에서만 수행했다.
- 브라우저 macOS에서 확인. Windows/Tauri native/배포/merge는 실행하지 않았다.

## 재현 진입점

`loading-live.html`은 `DEV` + loopback BFF 조건에서만 열린다. 실제 `PoseViewerPage`/`BarCandidatesPage`, HTTP service, Query cache와 선택 store를 사용한다. API 키는 클라이언트로 전달하지 않는다. 설치 자격은 메모리에만 유지하며 새로고침하면 다시 준비해야 한다. 공개 진행 기록만 sessionStorage에 저장한다. 실행 중 소스 편집/HMR은 피한다. 결과 화면의 앱/바 선택은 같은 캐시를 다시 사용해 새 분석을 생성하지 않는다.

완료 조건은 결과 HTTP 도착과 실제 선택 가능 여부다. 실패한 Job을 수동 성공 처리하거나, 검색·품질 검사를 건너뛰거나, 누락 후보를 임의 생성하지 않았다.
