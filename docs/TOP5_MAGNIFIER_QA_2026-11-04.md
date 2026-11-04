# Top5 우측 하단 돋보기 검수 — 2026-11-04

## 기준과 범위

- 별도 브랜치: `codex/top5-magnifier-20261104`.
- 기준: 클라이언트 PR #173의 실제 3D 구현 `6fd099e8b48ed1df9e1e98558ff3199d8cc74710`.
- 확인한 원격 develop: `5fe483e936e2a2ac22e9df9242a5a193504e4241`. 아직 해당 3D 구현이 없고 #173은 open이므로 #173 브랜치를 대상으로 작은 후속 PR을 쌓는다. #173 병합 후 develop으로 재지정한다.
- 원본 checkout과 #173 worktree는 수정하지 않았다. 서버 변경·유료 추론·배포·병합·기능 기본 활성화는 없다.

## 변경

공유 `PoseCandidateCard`의 3D 영역에만 `ZoomIn` 돋보기 하나를 우측 하단에 추가했다. 아이콘 15px, 보이는 배경 28px, 클릭 영역 40×40px이다. `aria-label="포즈 크게 보기"`, 키보드 포커스 표시, 기본 button의 Enter/Space 활성화를 제공한다. 카드의 선택 버튼은 별도로 유지하며 버튼 중첩은 없다. 회전 초기화 등 다른 카드 오버레이는 추가하지 않았다.

기존 `ExpandablePose` 모달에 같은 asset 또는 편집된 surface와 카메라·관찰 키를 전달한다. 캐시를 재사용하며 새 PNG/Converter 요청을 만들지 않는다. 확대와 닫기만으로 관찰 각도나 자산 revision은 바뀌지 않는다. 사용자가 모달 안에서 의도적으로 회전·줌하면 같은 관찰 상태를 공유하는 기존 동작을 유지한다.

모달 진입/복귀 포커스에 `preventScroll`을 적용했다. 검수에서 발견한 Esc 전파도 차단하여 모달을 닫을 때 플로팅 바까지 접히지 않게 했다.

## 자동 검증

- 전체 Vitest: **162 files / 1284 tests passed**, 선택적 외부 검증 3개 skipped. `NODE_OPTIONS=--no-experimental-webstorage npm test -- --no-cache`.
- 이번 집중 회귀: 13 tests passed. 두 카드 레이아웃의 단일 돋보기·우측 하단 배치·선택 및 포인터 분리·드래그·Enter/Space·focus trap·Esc 전파 차단·복귀 포커스·같은 관찰/asset revision·편집 surface 재사용과 기존 포스터/카메라 회귀를 확인했다.
- Typecheck, lint, production build 통과. 기존 `BodyCandidates.tsx` Fast Refresh warning 및 기존 번들 관련 build warning은 남아 있다.

## 실제 제품 컴포넌트 UI 검수

`/samples/real.html`은 실제 승인 모델의 기록된 Top5 자산으로 production `PoseViewerPage`와 `BarCandidatesPage`를 렌더한다. 새 실시간 백엔드 분석이나 네이티브 Tauri 창 검증을 의미하지 않는다. 합성 인형 샘플과 구분하며 모델 파일·이미지·토큰은 Git에 포함하지 않는다.

Chrome에서 다음을 확인했다.

- 앱·바 각각 5개 카드에 돋보기 하나씩 표시, 초기화 버튼 없음.
- 선택하지 않은 2번·5번 후보도 해당 실제 모델로 확대. 회전·줌·닫기·Enter/Space/Esc 동작.
- 바의 카드 드래그 후 선택 수 0, 모달 없음. 돋보기 확대 후에도 선택 수 0.
- Esc 이후 바의 5개 카드가 남고 모달만 사라지며 누른 돋보기로 포커스 복귀.
- 실제 클릭으로 앱 모달을 열고 닫은 전후 스크롤 이동 없음.
- 기본 viewport에서 앱·바 모두 각 카드 bounding rectangle이 변경 전과 **정확히 동일**. 정사각 영역과 bar fill 레이아웃 유지.
- 기존 측정 UI의 두 warm 확대 첫 프레임 **9.4ms / 13.3ms**. 추가 parse 없이 warm cache 사용. 닫은 뒤 WebGL context 1, views 5, geometry 5, asset cache 5 entries / 21,006,228 bytes. 단일 로컬 재생 측정이며 전체 성능 보장은 아니다.

비교 캡처와 측정 원본은 로컬 검수 산출물로만 보관한다. 실행 중 로컬 검수 URL은 `http://127.0.0.1:1442/samples/real.html`이며 상단에서 앱/바 전환 후 돋보기를 직접 조작할 수 있다.
