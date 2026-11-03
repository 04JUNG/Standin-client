# 내 데포르메 카드 UI 구현 — 2026-10-31

> 이 문서는 당시 UI 작업 기록이다. 카메라/리플레이/일반 빌드 경로의 현재 상태는 [2026-11-03 통합 기록](personal-deforme-integration-20261103/README.md)을 따른다.

## 기준과 작업 분리

- 브랜치: `codex/personal-deforme-ui-20261031`
- 기준 develop: `77d12abebd1b4ef064e4aeb63f7f329bc4298f11`
- PR #159의 `3b216a4c40d5f6bdcf38fa385594432f6d04052b`를 별도 Git worktree에 cherry-pick했다.
- 저장 흐름의 import 충돌은 최신 장면 메타데이터/저장 동의 기능과 개인 모델 저장 기능을 모두 보존해 해결했다.
- 원본 checkout과 PR #159 브랜치는 변경하지 않았다. PR #160 세션 리플레이 브랜치는 합치지 않았다.

## 구현한 흐름

1. 체형 커스텀 목록의 남성·여성·아동 옆에 내 데포르메 분류를 둔다. 서버 목록이 실패해도 개인 라이브러리는 열 수 있다.
2. 내 데포르메의 첫 칸은 기존 새 체형 만들기와 같은 점선 플러스 카드다. 별도 불러오기 버튼은 없다.
3. 플러스 카드를 누르면 카드 이름과 FBX·CS3C 파일 선택만 있는 불러오기 창을 연다. 진행 상태·취소·오류는 이 창에서 확인한다. 기존 파일 목록·모습 확인·이름 변경·파일 교체·삭제 행은 제거했다.
4. 기존 카드에 미리보기와 이름을 표시한다. 연필은 카드 안에서 이름 입력/저장/취소, Escape 취소를 제공한다. 휴지통은 삭제 확인 창을 연다. 이미 저장한 FBX 파일은 삭제하지 않는다.
5. 앱과 플로팅 바의 체형 더보기에서는 내 데포르메 이미지 카드를 선택한다. 이곳에는 등록·관리 UI나 수치 조절 설명을 표시하지 않는다. 선택·분류·스크롤은 설치/작업/인물별로 유지한다.
6. 선택한 개인 카드의 이름을 상단 칩과 접힌 인물 줄에도 표시한다. 같은 기본 체형으로 복귀할 때도 개인 선택을 해제한다.
7. 실제 제품 코드는 기존 `localBodyApi`의 Tauri 명령을 호출한다. 샘플 목록/등록 응답과 검수용 자산은 Git 제외 `work/ui-review/`에만 있다.

## 주요 코드

- `src/features/personal-body/PersonalDeformCards.tsx`: 관리 카드와 선택 전용 카드 스트립. 스크롤 저장, 목록 재조회/오류, 삭제 선택 정리. 화면 밖 미리보기 renderer는 해제한다.
- `src/features/personal-body/LocalLibrary.tsx`: 플러스 카드 및 신규 파일 불러오기 창. 등록 중 화면 이동 후 돌아와도 진행 확인·취소 가능. 중복 파일은 기존 카드 사용 안내.
- `src/features/body-selection/BodyPreferencesPage.tsx`, `BodyCandidates.tsx`, `bodyPanel.ts`: 분류 진입점, 인물별 분류 보존, 선택 이름 표시.
- `BodyCustomPage.tsx`: 수치 편집 화면에서 파일 등록 진입점 제거.
- `LocalFbxPreview.tsx`, `HandChips.tsx`, `contract.ts`, `useFramedReview.ts`: 개인 모델의 제품 용어를 내 데포르메로 통일.
- `Modal.tsx`, `ConfirmDialog.tsx`: portal에도 `data-replay-private` 표시 가능. 개인 이름·미리보기·입력 영역에 적용했다. 리플레이 기능 자체를 추가한 것은 아니다.
- `src-tauri/src/commands/personal_body.rs`: 네이티브 파일 선택 창 제목 변경.

## 검증

- TypeScript typecheck 및 production build.
- 전체 웹 테스트: 157개 파일, 1,270개 테스트 통과. 기존 1개 파일/테스트 skip 유지.
- 추가 UI 회귀: import 성공·중복·재조회 실패 보존·화면 이동 후 취소, inline rename의 입력 검증·실패·재시도·Escape, 삭제 취소/실패/성공, 인물별 선택 및 스크롤, 앱/바 분류 보존, 기본 체형 복귀, 칩/접힌 줄 이름 갱신.
- 개인 모델 Rust 단위 테스트 3개 통과. 실제 runtime을 요구하는 3개 테스트는 이번 UI 작업에서는 실행하지 않았다.
- macOS Chrome에서 실제 제품 컴포넌트 + 격리 UI fixture로 플러스 카드, GLB 표시, inline rename, 삭제 확인/취소, import-only 창, 앱→바 선택/이름 유지 확인. 해당 탭의 console error 없음.
- 변경한 TS 파일 ESLint: 오류 없음. `BodyCandidates.tsx`의 기존 Fast Refresh 경고 1개 유지. Vite의 기존 큰 chunk 경고 유지.

## 통합 및 출시 전에 남은 항목

이 문서는 UI 구현 완료 기록이다. 아래 확인을 출시 완료로 간주하지 않는다.

- 실제 설치 소유 BFF → Tauri 네이티브 파일 선택 → 포즈 저장 → CSP 불러오기 전체 E2E, 최종 외형, Windows/macOS x64.
- 후보의 `previewModel.rotation`이 개인 모델 로컬 변환 계약에 전달되지 않는 기존 camera rotation 차이. 미리보기/내보내기 방향 일치 검증 및 해당 계약 보완 필요.
- 런타임 패키지 서명·공증·배포, 라이선스/재배포 및 decoder 배포 확인. 일반 빌드에 런타임이 자동 포함된다고 가정하지 않는다.
- 최신 macOS arm64 검수 패키지는 CS3C를 지원한다. UI는 설치된 runtime의 capability에 따라 지원 형식을 안내한다. 이전 QA 문서의 decoder 미포함 기록은 당시 패키지에만 해당한다.
- Rust의 ignored CS3C 거절 테스트는 decoder 미포함 패키지를 전제로 한다. CS3C 지원 패키지의 성공 검증은 별도 최신 runtime 검수 기록을 따르며, 해당 테스트를 무조건 성공 기준으로 사용하지 않는다.

운영/스테이징 배포, 원격 push, PR Ready 전환, merge는 이번 작업에 포함하지 않았다.
