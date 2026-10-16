# 손 선택 화면

추론 서버 담당은 이동원, BFF와 클라이언트는 사용자 담당이다.
손 선택은 기존 앱/바의 저장 전 확인 화면에 추가한다. 통합 브랜치에서는 자연어 검색 결과에도 수동 손 선택을 제공한다. 함께 쓰는 계약은 [HANDS_SEMANTIC_INTEGRATION.md](HANDS_SEMANTIC_INTEGRATION.md)를 따른다.

## 사용자 흐름

1. 기존 방식으로 러프의 포즈·체형·출력 범위를 선택한다.
2. FBX 확인 화면에서 인물별 왼손·오른손을 확인한다. 좌우는 인물 자신의 기준이다.
3. 손 칩을 열어 추천 후보, 분류 또는 전체 목록에서 고른다. 이름과 설명으로 검색할 수 있다.
4. BFF 저장이 끝나면 변경한 손을 적용한 최종 PNG를 새로 받는다.
5. 이미지 확인이 끝난 뒤 저장한다. 확인한 review key와 hand revision으로 같은 FBX를 다운로드한다.

선택 UI는 `capabilities.handSelection=true`이고 포맷이 FBX일 때만 노출한다.
구 BFF는 기존 흐름을 유지한다. 손 추천이 없어도 서버가 제공하는 기본 선택으로 수동 편집할 수 있다.
BVH 저장에 손 모양을 반영한다고 표시하지 않는다.

## 표시와 상태

- 선택값은 `preset`이며 후보 첫 번째 값으로 덮어쓰지 않는다.
- 보이는 손의 high 추천은 “추천”, low는 “확인 필요”다.
- 안 보이는 손은 “기본 · 러프에서 안 보임”, 모르면 “기본”이다.
- 인식 실패와 자동 인식 비활성을 구분한다. 실패해도 수동 선택은 가능하다.
- 추천 원본과 최종 선택을 분리해 “추천으로 되돌리기”가 가능하다.
- 요청 실패 시 마지막 서버 저장값을 유지한다. revision/library 충돌이면 현재값을 다시 받는다.
- 이미지가 없어도 이름으로 선택한다. 인증된 BFF 이미지 URL은 blob으로 읽는다.
- 카탈로그는 HTTP 재검증하고, 이미지 URL에는 library hash를 붙여 이전 썸네일을 재사용하지 않는다.

손 적용 시 기존 후보용 3D GLB를 재사용하지 않고 최종 변환 FBX와 짝인 PNG를 표시한다.
칩만 변경해 옛 미리보기를 최종 결과로 확정하지 않는다. 손 저장·초기 조회·미리보기 생성 중과
미리보기 실패 시 저장은 잠긴다. 작업을 다시 열면 BFF에 저장된 선택을 복원한다.

앱에서는 후보 이미지 아래 인물별 손 패널을 제공한다. 바에서는 손 기능이 켜졌을 때 내용
최소 높이를 확보하고 기존 BarShell의 측정·창 크기 조정으로 확장한다. 여러 인물의 손은
스크롤 가능한 영역에 둔다. 선택 모달은 기존 공용 Modal의 포커스 가두기·Escape·포커스 복원을 따른다.

## 계약과 코드

손 API와 저장은 `src/features/hand-selection/`이 담당한다. 서버 상태는 installation·job·person별
TanStack Query에 보관한다. 전역 선택 store에 손 서버 데이터를 복제하지 않는다.
`useFramedReview`는 양 모드가 공용으로 쓰며, 손 revision이 바뀌면 최종 이미지 query도 바뀐다.
체형 모드에서는 BodyReview에 손 확인 정보를 추가한다. 일반 모드도 손 확인 receipt 없이 저장하지 않는다.

BFF 경로와 오류의 정본은 `Standin-app-server/docs/HAND_SELECTION_INTEGRATION.md`다.

## 검증 범위

React·API 테스트로 인물 기준 좌우, 추천 복원, 설명 검색, 빈 결과, capability 누락,
저장 중 차단, 충돌 재조회, 미리보기 revision 변경, 다운로드 헤더·FBX hash 대조를 확인한다.
macOS/Windows Tauri 네이티브 파일 저장과 실제 남/여 캐릭터 FBX 확인은 별도다.

## 실제 손 썸네일 연결 (2026-10-16)

프리셋 카드와 좌우 손 칩은 `HandThumbnail`을 공유한다. 카탈로그의 이미지가 준비되면
설치 인증을 붙여 `/v1/hands/{preset}/thumbnail?side=left|right&library=<sha256>`에서
원본 PNG를 가져온다. 좌우는 인물 기준 원본 파일을 각각 사용하고 CSS 반사는 하지 않는다.
프리셋 카드는 96px, 선택 칩은 48px 영역에 표시한다. 목록이 길어져도 완료 버튼은 아래에 고정한다.

`thumbnail.ts`는 PNG 형식/크기와 BFF가 제공하는 library SHA를 검사하고, 설치·라이브러리·
프리셋·좌우별로 캐시한다. 이미지 요청은 최대 12초이며 화면 이탈 시 취소한다. 로딩/실패/
미준비 상태는 구분하고 실패를 기본 손 아이콘으로 숨기지 않는다. `이미지 다시 불러오기`로
현재 이미지 요청을 재시도하고, 카탈로그 미준비 시 목록을 다시 조회할 수 있다.

실제 자산은 Standin-server PR #89 commit `fcd0a0defd458c4f385db762a51776269679eeca`의
`converter/hand_thumbs`를 사용한다. 79종 × 좌우 = 158 PNG를 manifest와 대조한 뒤
로컬 BFF 중계로 전부 재검증했다. Chrome에서 실제 이미지 디코딩(224px), 좌우 구분,
선택 저장, 좁은 창의 가로 넘침 없음·완료 버튼을 확인했다. UI 검증에 쓴 작업 저장소는
fixture이며 실제 배포 상태나 Tauri 네이티브 저장을 검증했다는 의미는 아니다.

타입 검사·린트·빌드, 프론트 전체 485개 테스트 통과. 실제 서버에는 해당 manifest와
PNG가 함께 배포되어 `thumbnails_available=true`여야 한다. 앱에 임의 손 이미지를 넣어
서버 라이브러리와 다른 그림을 보여주지 않는다.

## 2026-10-18 조회 전용 후보와 라이브러리 화면

홈의 손 라이브러리 보기(/app/hands)는 분류·이름/설명 검색과 실제 양손 PNG를 제공한다.
신규 동적·문장 후보는 결과 화면에서 ReferenceHands로 손을 선택·재조회한다. 후보·미리보기 버튼을 명시적으로
골랐을 때만 `/pose-previews/:candidate/:sha/hands?revision=N`의 PNG를 요청한다.
PNG signature·preview-only·손 revision·library header를 검사한다. 손이 바뀌면 옛 PNG를 숨기고 새 확인을 기다린다.
이 경로는 기본 체형·정면 참고 미리보기이며 자동 적용·refine·export·release 권한을 만들지 않는다.
기존 ReviewPage의 손 최종 확인 흐름은 안전한 구형 후보에만 기존 정책대로 적용된다.
