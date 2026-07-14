# 이번 주 실행 계획

## 1. 이번 주 목표

완성 결과:

```text
앱 실행
→ 로그인
→ 홈
→ 파일 선택 또는 화면 캡처
→ 캡처 미리보기
→ 분석 시작 직전까지 입력 준비
→ 로그아웃
```

서버가 준비되어 있으면 Mock 로그인 대신 실제 로그인 연결까지 진행한다.

---

## 2. 우선순위

### P0

- 문서와 레포 구조
- 디자인 토큰
- AppShell
- 로그인·로그아웃
- 파일 선택
- 화면 영역 캡처
- 캡처 미리보기
- 오류 상태

### P1

- 세션 복원
- 전역 캡처 단축키
- 드래그 앤 드롭
- 클립보드 붙여넣기
- 업로드 Mock
- 최근 작업 빈 상태

### P2

- 다크 모드
- 창 캡처
- 화면 녹화
- 고급 크롭
- 실제 분석 화면

---

## 3. 일자별 권장 계획

### Day 1 — 구조와 UI 기반

- Tauri 프로젝트 실행 확인
- 폴더 구조 정리
- 문서 추가
- 디자인 토큰
- Button, Input, AppShell
- Router와 인증 가드 뼈대
- Mock API 환경변수

완료 조건:
- 로그인과 홈 placeholder 라우트 이동
- 공통 UI가 Storybook 없이 앱에서 확인 가능

### Day 2 — 로그인·로그아웃

- 로그인 폼
- Zod 검증
- Mock AuthService
- 세션 상태
- 사용자 메뉴
- 로그아웃
- 오류 상태

완료 조건:
- 새로고침 또는 앱 재실행 시 설계한 방식대로 세션 처리
- 로그아웃 후 홈 접근 불가

### Day 3 — 홈과 파일 입력

- 홈 레이아웃
- 파일 DropZone
- 파일 선택
- 이미지 검증
- 미리보기
- 입력 삭제

완료 조건:
- PNG/JPG/WEBP 선택
- 잘못된 파일 오류
- 미리보기에서 분석 준비 상태

### Day 4 — 캡처 핵심

- 캡처 command 설계
- 영역 캡처 구현
- Escape 취소
- 임시 파일
- 캡처 후 앱 복귀

완료 조건:
- 단일 모니터 기준 영역 캡처 성공
- 취소와 실패 처리

### Day 5 — 연결과 안정화

- 캡처 미리보기
- `이 이미지 사용`
- UploadDraft 연결
- 권한 안내
- 다중 모니터 기본 테스트
- lint/build
- PR 문서와 스크린샷

완료 조건:
- 캡처 결과가 파일 입력과 같은 미리보기 화면으로 이동
- Windows 또는 주 개발 OS에서 전체 흐름 동작

---

## 4. 작업 분할 예시

### PR 1: 프로젝트 기반

```text
chore/project-foundation
```

- 폴더 구조
- tokens
- router
- providers
- 기본 AppShell

### PR 2: 인증

```text
feat/auth-flow
```

- LoginPage
- AuthService
- auth guard
- logout

### PR 3: 파일 입력

```text
feat/file-input
```

- DropZone
- validation
- preview

### PR 4: 캡처

```text
feat/region-capture
```

- Rust command
- React service
- capture preview

---

## 5. 이번 주 화면 목록

반드시:

- Splash / initializing
- Login
- Home
- Input Preview
- Capture Permission Error
- User Menu

Placeholder 가능:

- Analysis Progress
- Pose Viewer
- Settings

---

## 6. Mock 데이터 원칙

Mock은 실제 계약과 같은 타입을 사용한다.

```text
src/features/auth/api/auth.mock.ts
src/features/analysis/api/analysis.mock.ts
```

- 랜덤한 API 형태를 만들지 않음
- 고정 지연 300~800ms
- 성공·실패 시나리오 선택 가능
- 운영 build에서 비활성

---

## 7. 이번 주 데모 시나리오

1. 앱 실행
2. 로그인
3. 홈에서 파일 선택
4. 입력 미리보기 확인
5. 홈으로 돌아가 화면 캡처
6. 영역 선택
7. 캡처 미리보기
8. 이미지 사용
9. 분석 시작 버튼까지 이동
10. 로그아웃

이 흐름이 끊기지 않는 것이 이번 주의 가장 중요한 결과다.

---

## 8. 보류 결정

이번 주 안에 아래는 완전 결정하지 않아도 된다.

- 실제 3D 뷰어 방식
- BVH 리타게팅
- 녹화 구현 라이브러리
- 자동 업데이트
- 서버 Job 전달 방식
- 회원가입 화면

단, 인터페이스와 폴더 경계는 나중에 교체 가능하게 만든다.
