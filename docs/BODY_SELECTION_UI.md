# 체형 선택 UI 통합 — 2026-10-08

## 구현 범위

기존 1~2단계(체형 저장 계약·Top-K GLB/PNG)에 이어 3~5단계와 6단계의 자동/브라우저 검증을 구현했다.

- 클라이언트: `codex/body-selection-ui`, develop `4b606cf`에서 분기.
- BFF: 기존에 푸시한 `codex/body-preview-integration`의 `5bdbe2f` 위에서 이어 작업.
- converter: 이전 `codex/body-preview-contract`의 `c6c8f80` 그대로 필요.
- 자동 체형 감지: 별도 서버 `feat/body-selection`의 감지 결과 계약을 소비한다. 검색·VLM·refine 알고리즘은 이번에 바꾸지 않았다.

## 사용자 흐름

1. 작업 생성 시 서버가 개인 기본 설정을 snapshot한다.
2. 자동 추천 체형의 실제 후보 개수만 표시한다. 포즈는 자동 선택하지 않는다.
3. 인물의 ‘체형 더보기’에서 현재 인물의 승인 체형을 선택한다.
4. PUT 완료 후 최신 체형의 모든 후보 이미지가 준비되어야 진행할 수 있다.
5. 체형 칩의 ‘포즈 | 체형 더보기’ 전환에서 ‘포즈’를 눌러 Top-5로 돌아간다. 닫으면 새 체형으로 다시 그린 후보가 보인다(2026-10-14 개정, 아래 절).
6. 최종 확인에서 선택한 체형·보정된 포즈·출력 범위를 함께 확인한다.
7. 확인 결과와 동일한 FBX만 저장한다. 중간에 바뀌면 다시 확인해야 한다.

선택 즉시 현재 인물에 적용하며 개인 기본 설정은 변경하지 않는다. 패널 접기는 선택 취소가 아니다.
작업 기본값으로 돌아가기(inherit)와 자동 추천으로 돌아가기(auto)는 다르다. fixed_default 작업에서도 auto는 해당 인물의 실제 추천을 선택한다.

## 상태와 캐시

서버 상태는 React Query의 `["body", installationId, serverJobId, personIndex, ...]`에만 둔다.
기존 로컬 characterId/preferredCharacterId는 구 계약 경로에만 사용한다.
패널 펼침 상태만 Zustand에 두어 앱↔바 이동에도 이어진다.

- 분석 Query는 새 Job을 생성할 수 있으므로 체형 변경에서 invalidate하지 않는다.
- Top-K는 하나의 이미지 묶음 Query가 완성되어야 표시한다. 서로 다른 체형의 이미지를 섞지 않는다.
- revision이 바뀌면 이전 요청을 취소한다. 완료가 늦은 이전 요청은 새 Query를 덮을 수 없다.
- PUT 중 다른 표면에서도 진행을 막는다. 연속 PUT은 저장 중 버튼을 잠가 충돌을 줄인다. 렌더 중에는 다음 체형을 선택할 수 있다.
- 동일 mutation의 과거 응답을 현재 값으로 쓰지 않도록 PUT 뒤 GET으로 재확인한다.
- 앱 설치 변경·철회 시 body Query를 취소하고 제거한다.
- 체형 변경은 후보 순위·ID·포즈 선택·이미 있는 refine 결과를 삭제하지 않는다.
- 최종 확인 재진입 시 같은 Job/후보의 기존 refine 결과를 재사용한다.

## 기본 설정

`/app/models`에서 설치별 서버 설정을 사용한다.

- `auto`: 기본. 추천 → 개인 기본 체형 → 승인 카탈로그 기본 체형 순서는 서버가 결정.
- `fixed_default`: 사용자가 명시적으로 선택했을 때만 적용.
- 기본 체형 ID를 등록하는 것만으로 fixed_default로 전환하지 않는다.
- 이미 생성한 Job/인물은 바꾸지 않는다.
- 명시적 BODY_SELECTION_DISABLED/404/501만 구 설정 화면으로 내려간다. 통신 오류를 ‘지원 안 함’으로 바꾸지 않는다.

## 이미지 계약

새 Top-K 경로에는 characterId query를 추가하지 않는다.

1. manifest의 Job·인물·revision·BodyRef·후보 순서·원본 hash·camera를 검증한다.
2. 인증된 GLB를 내려받아 응답 헤더와 bytes SHA256을 검증한다.
3. GLB 내부 asset.extras의 character hash와 exporter revision도 검증한다.
4. GLB/WebGL 실패 시 같은 manifest의 PNG를 사용한다.
5. 취소·401·403·404·409는 이전 PNG 요청으로 이어지지 않는다.

T 포즈 카드는 BFF body-options의 optional `neutralPreview`를 사용한다.
체형 asset hash와 PNG bytes hash를 함께 검증하고 공통 프레이밍 이미지를 그대로 표시한다.
2026-10-15 결정: 기본 사진과 체형 비교는 T 포즈로 제공한다. 승인 카탈로그와 일치하는 이미지를 사용한다.
승인된 이미지가 없으면 ‘T 포즈 이미지 준비 중’으로 표시하며 다른 체형 그림을 대신 쓰지 않는다.

## 작은 창

- 후보는 2열, 640px 이상에서는 3열로 표시한다.
- 바의 진행 버튼은 스크롤 영역 밖에 고정한다.
- 체형 패널은 최대 340px이고 카드 목록만 내부 스크롤한다. 체형 확정 버튼은 패널 안에 고정한다.
- 확장 바는 최대 760px, 네이티브에서는 현재 모니터 work_area를 기준으로 크기·위치를 다시 제한한다.
- 화면 이동으로 새 분석을 만들지 않는다.

## 최종 확인·저장 계약

기존 `/framed` 경로에 `bodySelectionRevision`을 추가한다.
BFF는 characterId를 클라이언트 기본 설정에서 가져오지 않고 저장된 BodySelection에서 확정한다.

최종 PNG 응답의 `X-Standin-Review-Key`는 소유 설치·Job·인물·후보·최종 BVH hash·체형 전체 버전·camera·scope·render runtime·FBX hash에 묶인다.
같은 경로의 `format=fbx&reviewKey=...`로만 새 체형 UX의 파일을 받는다.

- 확인 화면이 없는 직접 저장은 클라이언트에서 차단한다.
- 서버도 body 모드 FBX의 reviewKey 누락·불일치를 거절한다.
- 다운로드 때 현재 체형·출력 범위·후보 확정·소유권·원본 격리·refine·runtime을 다시 검증한다.
- 클라이언트는 다운로드 header identity와 실제 FBX SHA256을 확인한 뒤 네이티브 저장을 호출한다.
- 여러 인물은 전부 다운로드에 성공한 뒤 파일 저장을 호출한다.
- 실패 화면에서 ‘체형·포즈 다시 확인’으로 복귀할 수 있다.
- 새 체형 경로에서는 임의의 기본 남성형으로 저장하는 복구 버튼을 제공하지 않는다.
- BVH는 체형을 담지 않는다. 사용자가 BVH를 선택한 경우 기존 모션 저장 경로를 유지한다.

## 기능 활성화·순차 배포

BFF의 `BODY_SELECTION_ENABLED=true`와 `BODY_UX_ENABLED=true`, converter 설정이 있어야 `capabilities.bodyPreviews=true`다.
기본값은 둘 다 false. snapshot 없는 구 Job에는 bodyPreviews를 끈다.
이 flag는 자산 준비/서비스 health 보장이 아니다. 미리보기 실패 시 계속 진행하지 않는다.

승인 카탈로그/모델/T 포즈 이미지 준비 → converter 계약 배포 → BFF 배포 → 클라이언트 배포 → 대상 환경 검수 후 flag 활성화 순서다.
기능 브랜치에 푸시하고 develop 대상 PR로 검토한다. 운영 배포·flag 변경은 별도다.

## 검증과 한계

- 클라이언트 전체 테스트, 타입 검사, lint, build.
- BFF 전체 테스트: 일회용 실제 PostgreSQL + Hono 저장 테스트 포함.
- 실제 React 앱/바를 Chrome에서 실행하고 격리된 9종 API fixture로 선택→접기→앱 전환→최종 확인→다운로드 연결을 검증.
- fixture PNG는 QA 표시를 넣은 도식이다. 실제 9종 FBX 외형 검증이 아니다.
- Rust cargo check: macOS 호스트에서 컴파일 확인.
- Windows/macOS Tauri 실행·다중 모니터·CSP 드롭 실기 검수와 실제 9종 FBX/T 포즈 이미지 승인은 남아 있다.
- 동일 캐릭터를 다른 컷에서 계속 쓰는 기능은 2.0 후속이다.

주요 파일: `features/body-selection/*`, `useAnalysisResult`, `BodyCandidates`, `useFramedReview`, `useSaveFlow`, `window_mode.rs`.
브라우저 검증 기록은 `artifacts/body-selection-ui/`에 보관한다.

최종 검증 수치: 클라이언트 421개, BFF 319개(skip 0), 타입/lint/build 및 macOS cargo check 통과. 실제 브라우저 검증 결과는 [기록](../artifacts/body-selection-ui/README.md)에 있다.

## PR 전 검수

- 최초 체형 조회 실패 후 재시도가 이전 undefined selection으로 렌더하지 않도록 현재 Query를 갱신한다.
- 최종 확인 재시도도 체형 조회·Top-K·최종 결과를 다시 확인한다. 회귀 테스트 2개 추가.
- 설치 전환 뒤 늦은 기본 설정 응답은 이전 캐시에 쓰지 않는다.
- 진행 중인 [창 위치 수정 PR #79](https://github.com/04JUNG/Standin-client/pull/79)도 `WindowModeSync.tsx`를 수정한다. 병합 순서에 따라 760px 상한과 해당 PR의 위치 복원 동작을 함께 유지해야 한다.

## 설정 화면 활성화 보완

BFF는 공개 body-preferences GET/PUT에도 후보 bodyPreviews와 같은 활성화 조건(BODY_SELECTION_ENABLED + BODY_UX_ENABLED + FBX 설정)을 적용한다. 저장 기능만 켠 단계에서는 BODY_SELECTION_DISABLED로 구 설정 UI를 유지한다. 클라이언트는 일시적인 5xx나 네트워크 장애를 이 상태로 오인하지 않는다.

## 2026-10-14 개정 · 쉐이프키 체형 UX와 인물별 내보내기

흐름: Top-5 → ‘체형 더보기’ → 체형 비교·조절 → ‘포즈’ 전환 → 새 체형으로 다시 그린 Top-5 →
포즈 선택 → 이후는 기존 `저장할 포즈 확인`·저장 화면 그대로.

- **원본 패널.** 후보 옆에 원본 러프를 둔다. ‘이 인물’은 서버 인물 상자(`box`, 원본 픽셀
  `[x1,y1,x2,y2]`)로 자른 그림, ‘전체’는 원본 위 인물 상자이며 상자를 누르면 그 인물로 넘어간다.
  상자가 원본 크기를 벗어나면 좌표계가 다르다고 보고 자르지 않는다.
- **선택 스위치(내보내기).** 인물마다 끌 수 있다. 끈 인물은 `selectedByPerson`에서 빠지고(다시 켜면
  고른 후보를 되살린다) 진행 조건·확정 요청에서 제외된다. 확인·저장 화면은 `selectedByPerson`만
  읽으므로 바꾸지 않았다. 진행 조건은 “켠 인물이 1명 이상이고 모두 골랐다”. BFF의
  `PUT .../selections`는 받은 목록으로 확정 집합을 대체한다.
- **체형 더보기.** Top-5 자리를 바꾼다(바 720×560 고정). 체형 종류 남성·여성·아동, 맨 앞에 고정된
  원본 카드, 카드를 누르면 즉시 PUT. 여닫기는 체형 칩의 ‘포즈 | 체형 더보기’ 전환(코랄 바탕이
  고른 쪽으로 미끄러진다)으로만 하고, 하단 주 버튼은 펼친 동안에도 포즈 진행 버튼 그대로다.
- **조절 바.** 서버가 그 체형의 `shape`(`body-shape.v1`)를 줄 때만 슬라이더를 연다. 손을 뗀 뒤
  0.6초 쉬면 `{ intent: "manual", characterId, shape: { controls } }`로 저장하고, 저장 중 움직인
  값은 새 revision을 받은 뒤 보낸다. 버튼은 자동 추천(auto) · 내 기본값(설정의 `shapeDefault`,
  없으면 `defaultCharacterId`) · 초기화(같은 체형, shape 없이).
- **설정 › 체형 기본 설정 › 내 기본 체형 수치.** 서버가 `shapeEditable`을 줄 때만 보인다.
- **후보 다시 찾기.** `capabilities.candidateRerun`과 서버 동작이 생길 때만 6번째 칸/버튼을 그린다.
  지금은 어떤 BFF도 노출하지 않아 그리지 않는다.
- **비교 자세 전환(T 포즈/고른 포즈).** 체형별 포즈 렌더가 없어 넣지 않았다.

⚠ converter가 수치 체형을 아직 굽지 못한다. BFF는 shape가 있는 선택의 미리보기·FBX를
`409 BODY_SHAPE_RENDER_UNSUPPORTED`로 막으므로, `BODY_SHAPE_EDIT_ENABLED`를 켜기 전에 converter 연동이 필요하다.
- **출력 범위 선택은 후보 화면에서 뺐다(2026-10-14).** 범위는 서버 자동 판별값을 쓴다.
- **앱의 접힌 인물 줄**은 줄 전체가 버튼이다(누르면 펼침, 호버 시 옅은 배경과 › 표시). 줄 안의 선택 스위치는 펼치지 않는다.

- **이전 인물 버튼.** 앱·바 모두 하단 주 버튼(이 포즈 사용 / 다음 인물로) 왼쪽에 둔다. 인물 순서에서 바로 앞 인물로 가고, 맨 앞이면 꺼진다. 인물이 한 명이면 그리지 않는다.
- **체형 더보기 레이아웃(2026-10-15).** 왼쪽 큰 박스 “내 체형”(조절 바에 따라 그 자리에서 다시 그림, 원본 러프를 작게 겹침) | 오른쪽 프리셋 줄(고정 그림, 고른 것에 “선택됨”). 실서버 실시간 렌더 계획과 주의점은 [BODY_SHAPE_LIVE_PREVIEW.md](BODY_SHAPE_LIVE_PREVIEW.md).
