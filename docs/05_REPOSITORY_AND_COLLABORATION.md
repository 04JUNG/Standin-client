# 레포 구조 및 협업 규칙

## 1. 팀 개발 목표

두 명이 UI와 기능을 병렬로 구현해도 충돌이 적도록 기능 단위로 나눈다.

권장 역할 예시:

### 사용자

- 문서 정립
- 디자인 토큰과 공통 UI
- 로그인·로그아웃 UI 및 상태
- 홈 화면
- 화면 캡처
- 캡처 미리보기

### 팀원

- 분석 API adapter
- 분석 Job 진행 화면
- 후보 뷰어
- BVH 저장
- 서버 연동

역할은 바뀔 수 있지만 파일 소유 경계를 먼저 합의한다.

---

## 2. 브랜치 전략

작은 팀에서는 GitHub Flow를 권장한다.

```text
main
├─ feat/app-shell
├─ feat/auth
├─ feat/capture
├─ feat/analysis-job
├─ feat/pose-viewer
└─ fix/...
```

규칙:

- `main`은 항상 실행 가능한 상태
- 기능별 짧은 브랜치
- 큰 기능은 여러 PR로 분리
- 직접 main push 금지
- PR merge 전 최소 1명 확인
- rebase 또는 squash 방식 하나를 합의

---

## 3. 커밋 메시지

Conventional Commits 간단 적용:

```text
feat(auth): 로그인 화면과 세션 복원 추가
feat(capture): 영역 캡처 command 연결
fix(upload): PNG 확장자 검증 수정
docs: 캡처 명세 업데이트
refactor(api): 분석 job adapter 분리
test(auth): 로그인 실패 테스트 추가
chore: lint 설정 추가
```

한 커밋에 UI, API, Rust 대규모 변경을 모두 섞지 않는다.

---

## 4. PR 크기

권장:

- 리뷰 가능한 변경: 300~500줄 안팎
- 생성 파일과 lockfile 제외
- 한 PR은 하나의 사용자 흐름
- UI 대규모 변경은 스크린샷 첨부
- 운영체제별 확인 여부 기재

PR 템플릿:

```md
## 작업 내용

## 사용자 흐름

## 스크린샷

## 테스트
- [ ] npm test
- [ ] npm run lint
- [ ] npm run build
- [ ] tauri dev
- [ ] Windows
- [ ] macOS

## 서버/Mock
- [ ] Mock
- [ ] 실제 API

## 알려진 한계

## 관련 문서/이슈
```

---

## 5. 코드 소유 경계

### 충돌이 잦은 파일

- `App.tsx`
- router
- global CSS
- package.json
- Tauri config
- Rust `lib.rs`

이 파일은 변경 전 팀 채널에 공유한다.

### 기능별 소유

각 feature는 자체 API, component, schema를 갖는다.

```text
features/capture/
├─ api/
├─ components/
├─ hooks/
├─ pages/
├─ store/
└─ types.ts
```

---

## 6. 공통 UI 개발

공통 컴포넌트 후보:

- Button
- IconButton
- Input
- Select
- Checkbox
- Modal
- Toast
- Badge
- EmptyState
- ErrorState
- LoadingState
- AppShell
- DropZone
- ShortcutKey

공통 컴포넌트를 너무 이르게 모두 만들지 않는다. 두 곳 이상에서 실제로 반복될 때 추출한다.

---

## 7. 환경변수

`.env.example`:

```text
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_API=true
VITE_APP_ENV=development
```

- `.env` 커밋 금지
- API secret을 프론트에 두지 않음
- 운영·개발 서버 URL 구분
- 팀원별 로컬 설정 문서화

---

## 8. 문서 갱신 규칙

아래 변경은 관련 문서를 함께 수정한다.

- 사용자 흐름 변경
- API request/response 변경
- 캡처 저장 방식 변경
- 토큰 저장 방식 변경
- 지원 파일 형식 변경
- MVP 범위 변경

구현과 문서가 충돌하면 PR에서 명시하고, merge 전에 하나로 맞춘다.

---

## 9. 이슈 템플릿

```md
## 배경

## 사용자 문제

## 완료 조건

## 제외 범위

## 디자인/문서

## API 의존성

## OS 의존성

## 테스트 시나리오
```

---

## 10. Definition of Done

기능 완료는 코드가 작성된 상태가 아니다.

- 요구 흐름 작동
- 로딩·빈 상태·오류 상태 존재
- 키보드 접근 가능
- 타입 오류 없음
- lint/build 성공
- Mock/실제 API 여부 명확
- 문서 반영
- 스크린샷 또는 녹화 첨부
- 운영체제 확인 범위 기록
