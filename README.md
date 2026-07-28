# Standin Desktop App

웹툰 러프 콘티나 화면 캡처에서 가까운 3D 인체 포즈 후보를 찾아, 작가가 비교·선택하고 포즈 파일로 저장하는 Tauri 데스크톱 앱이다. 이 저장소는 데스크톱 앱만 담당한다(서버·랜딩페이지는 별도 저장소).

## 기술 스택

Tauri v2 · React · TypeScript · Vite · Tailwind CSS · TanStack Query · Zustand · React Hook Form + Zod · Lucide React

스타일링/토큰 등 주요 결정은 [docs/adr/](docs/adr)에 기록한다.

## 요구 사항

- Node.js 20+
- Rust 툴체인(`rustup`) — Tauri 네이티브 빌드(`tauri dev/build`)에 필요. 프론트엔드 개발(`npm run dev`)만 할 경우 없어도 된다.

## 시작하기

```bash
npm install
cp .env.example .env   # 필요 시 값 수정

# 프론트엔드만 브라우저에서 개발/미리보기 (Rust 불필요)
npm run dev            # http://localhost:1420

# 데스크톱 앱으로 실행 (Rust 필요)
npm run tauri dev
```

Rust 미설치 상태에서 `tauri dev`는 실패한다. 설치: <https://www.rust-lang.org/tools/install>

### 아이콘

`src-tauri/icons/`가 아직 없다. Tauri 번들 빌드 전 아이콘을 생성한다.

```bash
npm run tauri icon path/to/logo.png
```

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run tauri dev` | 데스크톱 앱 개발 실행(Rust 필요) |

## 환경변수

`.env`는 커밋하지 않는다. 자세한 규칙은 [docs/05](docs/05_REPOSITORY_AND_COLLABORATION.md) §7.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | 서버 base URL |
| `VITE_USE_MOCK_API` | `true` | Mock 서비스 사용 여부. 운영 build에서 비활성 |
| `VITE_APP_ENV` | `development` | `development` / `production` / `test` |

## Mock 모드

`VITE_USE_MOCK_API=true`(개발 환경)에서는 실제 서버 없이 동작한다. 좌측 하단 `MOCK 모드` 배지로 표시된다.

- 개발용 로그인 계정: `demo@standin.app` / `password`

## 플로팅 바

그림 작업 화면 위에서 **앱 창에 진입하지 않고** 캡처 → 후보 확인 → 저장까지 끝내는 경로입니다.

- 전역 단축키(`Ctrl+Shift+S`), 앱 상단의 **플로팅 바** 버튼, 또는 **앱 창 최소화**로 진입합니다. 최소화하면 작업 표시줄로 숨는 대신 화면 위 동그란 버튼으로 남습니다.
- 접힌 버튼은 눌러서 펴고 끌어서 옮깁니다.
- 바에서 `C` 캡처 / `U` 업로드 → 분석 → 후보 선택 → 저장.
- 상단 핸들을 드래그해 옮기며 위치는 다음 실행에도 유지됩니다.
- `Esc`로 접고, 셸의 "앱 창으로 열기"로 언제든 앱 모드로 나갑니다.

창 하나를 바·앱·오버레이 모드로 변형하는 구조라 바와 전체 앱 화면이 동시에 보이지는 않습니다. 이유와 대안 검토는 [ADR-008](docs/adr/ADR-008-window-modes.md).

브라우저 개발 모드에서는 창 조작이 no-op이라 `/bar/*` 경로로 레이아웃만 확인할 수 있습니다.

## 단축키

전체 목록은 앱에서 `?`를 눌러 치트시트로 확인한다. 정본은 `src/shared/lib/shortcutRegistry.ts` 하나이며 앱 내 훅·네이티브 등록·설정 UI·치트시트가 모두 그것을 읽는다.

- **전역 캡처**: `Ctrl+Shift+S`(macOS `⌘⇧S`). 앱이 백그라운드여도 동작하며 설정에서 변경할 수 있다.
- **앱 내**: 화면별 고정. 예) 저장 `Ctrl+S`, 분석 시작 `Ctrl+Enter`, 취소 `Esc`.

전역 단축키는 데스크톱(`npm run tauri dev`)에서만 등록된다. 브라우저 개발 모드에서는 같은 키가 앱이 활성일 때만 동작하는 대체 경로로 내려가고, 설정 화면이 그 사실을 표시한다.

다른 프로그램이 이미 쓰는 조합으로 바꾸면 등록에 실패하고 이전 키로 되돌릴 수 있다.

자세한 규칙은 [docs/07 §7](docs/07_CAPTURE_AND_UPLOAD_SPEC.md), 등록 계층 결정은 [ADR-007](docs/adr/ADR-007-global-shortcut-registration.md).

## 폴더 구조

```text
src/
├─ app/         # 라우터, providers, 인증 가드, 앱 진입
├─ features/    # 기능 단위(auth, home, settings, ...)
├─ shared/      # 공통 api client, 컴포넌트, lib
src-tauri/      # Tauri v2 네이티브(commands는 후속 브랜치)
docs/           # 제품·아키텍처·명세·ADR 문서
```

## 문서

`CLAUDE.md`와 [docs/](docs)를 순서대로 읽는다. 협업·브랜치·PR 규칙은 [docs/05](docs/05_REPOSITORY_AND_COLLABORATION.md).

## 현재 구현 범위

프로젝트 파운데이션(브랜치 `chore/project-foundation`):

- 디자인 토큰 + Tailwind 연결, 공통 UI(Button, Input, AppShell)
- 라우터 + 인증 가드, 세션 복원 뼈대
- 로그인·로그아웃(Mock/HTTP 서비스 경계 분리)
- 홈·설정 화면 스켈레톤
- Tauri v2 설정 파일(네이티브 command는 미구현)

미구현/후속: 파일 입력, 화면 캡처, 실제 분석·후보 뷰어·BVH 저장.
```
