# ADR-001: 스타일링 방식

- 상태: 제안됨
- 날짜: 2026-07-14
- 관련 문서: CLAUDE.md §4, §11, docs/04_DESKTOP_UI_GUIDE.md

## 배경

CLAUDE.md는 "Tailwind CSS 또는 CSS Modules 중 프로젝트에서 확정한 하나"를 쓰라고 하지만 아직 확정되지 않았다. Day 1에 디자인 토큰과 공통 UI(Button, Input, AppShell)를 깔아야 하므로 착수 전에 결정이 필요하다. 두 명이 병렬 작업하므로 스타일 관례가 갈리면 충돌과 재작업이 커진다.

제약:

- `docs/04_DESKTOP_UI_GUIDE.md`의 컬러/치수 토큰을 CSS 변수로 이미 정의하고 있다.
- 앱은 조밀한 8px 그리드와 다수의 상태(hover/focus/disabled/loading)를 요구한다.
- 랜딩페이지와 브랜드 토큰을 공유하되 저장소는 분리되어 있다.

## 선택지

### A. Tailwind CSS

- 장점: 상태 variant(`hover:`, `focus-visible:`, `disabled:`)와 조밀한 간격 유틸리티가 8px 그리드와 잘 맞음. 공통 컴포넌트 없이도 화면을 빠르게 조립. 디자인 토큰을 `theme.extend`로 CSS 변수와 연결 가능.
- 단점: 클래스 문자열이 길어짐. 초기 설정(PostCSS, config, 토큰 매핑) 필요. 팀이 유틸리티 관례에 합의해야 함.

### B. CSS Modules

- 장점: 표준 CSS에 가깝고 러닝커브 낮음. 컴포넌트별 스코프가 명확해 소유 경계와 잘 맞음. CSS 변수(이미 정의됨)를 그대로 사용.
- 단점: 상태·variant를 매번 직접 작성. 공통 컴포넌트를 일찍 만들어야 반복이 줄어듦. 파일 수 증가.

### C. CSS-in-JS(styled-components 등)

- 런타임 비용과 SSR 무관한 데스크톱 앱 특성상 이점이 작고, 팀 표준도 아니므로 제외.

## 결정

**A. Tailwind CSS**를 권장한다.

근거:

- 이 앱은 화면당 상태 조합(hover/focus/disabled/loading/selected)이 많고 간격 체계가 촘촘하다. Tailwind의 상태 variant와 spacing 스케일이 이 요구에 직접 대응한다.
- `docs/04` 토큰을 `:root` CSS 변수로 두고 `tailwind.config`의 색/간격을 그 변수에 매핑하면, 브랜드 토큰 단일 정본을 유지하면서 유틸리티를 쓸 수 있다.
- 공통 컴포넌트를 "두 곳 이상 반복될 때 추출"(docs/05 §6)하는 원칙과 잘 맞는다. 추출 전에도 유틸리티로 화면을 완성할 수 있다.

## 결과

- `tailwind.config`의 `theme.extend`에서 색은 CSS 변수(`var(--brand-coral)` 등)를 참조하고, 간격은 4/8/12/16/24/32/48을 명시한다.
- 다크 모드는 `class` 전략으로 설정만 열어두고 이번 주 구현은 보류(docs/04 §12).
- 반복되는 상태 조합(예: primary/secondary 버튼)은 컴포넌트로 추출하고, 클래스 나열이 길어지는 지점을 추출 신호로 삼는다.
- 재검토 조건: Tailwind 클래스 관리가 팀 리뷰를 방해할 정도로 커지면 컴포넌트 추출 기준을 강화한다.
