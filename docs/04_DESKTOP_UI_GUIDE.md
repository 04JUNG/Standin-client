# Standin Desktop UI 가이드

## 1. 랜딩페이지와의 관계

앱은 랜딩페이지와 같은 브랜드로 보여야 하지만 목적은 다르다.

| 항목 | 랜딩페이지 | 데스크톱 앱 |
|---|---|---|
| 목적 | 설명과 전환 | 반복 작업 수행 |
| 여백 | 넓음 | 조밀함 |
| 타이포 | 큰 제목 | 정보 밀도 우선 |
| 애니메이션 | 브랜드 전달 | 상태 이해 |
| 배경 | Paper 중심 | Surface와 Canvas 혼합 |
| CTA | 베타 등록 | 캡처·분석·저장 |

브랜드 색은 유지하고, 컴포넌트 크기와 간격은 작업 도구에 맞게 줄인다.

---

## 2. 디자인 콘셉트

> 종이 콘티의 러프함과 3D 작업 캔버스의 정밀함이 연결되는, 빠르고 믿을 수 있는 창작 도구.

키워드:

- Fast
- Focused
- Creator Controlled
- Desktop Native
- Clear Progress

---

## 3. 컬러

랜딩페이지 토큰을 공유한다.

```css
--brand-ink: #152238;
--brand-coral: #ff6b57;
--brand-coral-dark: #e95543;
--brand-sky: #8ed8e8;
--brand-paper: #f8f5ef;
--brand-canvas: #202b3c;

--surface-0: #ffffff;
--surface-1: #f5f7f9;
--surface-2: #eef1f4;
--border: #d8dde5;
--text-primary: #101722;
--text-secondary: #667085;
```

앱에서는 Paper 배경을 전체에 사용하지 않고 환영 화면이나 빈 상태에 제한한다.

---

## 4. 크기 체계

### 기본 8px Grid

- 4px: 아이콘과 텍스트 미세 간격
- 8px: 내부 최소 간격
- 12px: 작은 컴포넌트
- 16px: 기본 padding
- 24px: 카드와 패널
- 32px: 화면 주요 여백
- 48px: 큰 섹션

### 앱 치수

- Top bar: 56px
- Sidebar expanded: 220px
- Sidebar collapsed: 64px
- Primary button: 40px
- Large action button: 48px
- Input: 40px
- Candidate card: 최소 156×180px
- Dialog width: 440~640px

---

## 5. 타이포그래피

- Font: Pretendard Variable
- App title: 24~28px / 700
- Page title: 22~24px / 700
- Section title: 16~18px / 650
- Body: 14~15px / 400
- Label: 12~13px / 600
- Caption: 12px / 400
- Code / shortcut: system monospace

랜딩페이지의 40px 이상 큰 제목은 로그인과 첫 빈 화면에서만 제한적으로 사용한다.

---

## 6. 앱 셸

### Sidebar

- Ink 배경 또는 밝은 surface 중 하나로 고정
- 랜딩페이지와의 연결을 위해 Ink 배경 권장
- 선택 메뉴는 Coral marker + 밝은 텍스트
- 아이콘과 라벨
- 하단에 설정과 사용자 메뉴

### Top bar

- 현재 작업명
- 네트워크 상태
- 분석 작업이 있으면 작은 진행 indicator
- 창 드래그 영역과 충돌하지 않게 설계

Tauri 커스텀 타이틀바를 이번 주에 꼭 구현할 필요는 없다. 운영체제 기본 타이틀바를 우선한다.

---

## 7. 홈 입력 UI

### 메인 Drop Zone

- 큰 점선 패널
- 파일 아이콘
- `파일을 여기에 놓으세요`
- `또는 파일 선택`
- Secondary CTA

### Capture CTA

- Coral 배경
- 캡처 아이콘
- `화면 캡처`
- 단축키 badge
- 홈에서 가장 강한 행동 중 하나

### Recording

- Neutral 카드
- `준비 중`
- disabled 상태가 명확해야 함

---

## 8. 작업 캔버스

### 레이아웃

- Canvas 영역: Ink/Canvas
- Inspector 또는 후보 영역: White
- 구분선: Border
- 컨트롤은 캔버스 위 floating toolbar 또는 하단 bar

### 이미지 미리보기

- checkerboard보다 Paper 톤 배경
- 확대·축소
- 화면 맞춤
- 실제 픽셀
- 크롭 시 선택 영역은 Sky
- 인물 스켈레톤은 Coral

---

## 9. 분석 상태

색상만으로 구분하지 않는다.

| 상태 | 표현 |
|---|---|
| 대기 | Clock + `대기 중` |
| 진행 | Spinner + 현재 단계 |
| 성공 | Check + `후보 준비 완료` |
| 실패 | Alert + 설명 + 재시도 |
| 취소 | Minus + `취소됨` |

서버가 제공하지 않는 비율을 실제 진행률로 표시하지 않는다. 추정치는 아래 규칙에 따라 명시적으로 구분한다.

포즈 검색 대기 화면은 앱 창과 플로팅 바 모두 현재 입력한 러프를 Paper 배경 위에
잘리지 않게 표시한다. 사용자 승인된 컴팩트 필름 방향(2026-11-05): 별도 스캔 레이어가
러프를 훑고 실제 관절과 관측 키워드가 나타난 뒤 준비된 포즈 카드가 펼쳐졌다 정리된다. 여섯 구간(러프 확인·자세 읽기·동작 이해·포즈 찾기·러프 맞춤·후보 정리)은 서버의 progress snapshot을 따른다. 실제 데이터가 없는 관절/키워드/후보는 그리지 않는다. 원본 파일과 픽셀은 수정하지 않는다.
`prefers-reduced-motion: reduce`에서는 스캔·필름·후보 등장·조정·spinner를 정지한다.
미리보기 로드 실패는 검색 실패로 취급하지 않는다.

업로드/대기/처리/후보 준비 단계는 실제 HTTP 작업과 Job 상태에 연결한다. 현재 서버는
세부 완료 비율을 주지 않으므로 숫자는 반드시 `예상 진행률`로 표시한다. 단계 내 경과 시간의
완만한 추정치이며 대기 중에는 100%가 되지 않는다. 기록 조회는 퍼센트와 다른 초안을
표시하지 않는다. 선택 후 조정도 같은 컴포넌트를 사용하며 선택한 포즈는 처리 중 참고 이미지다. 실제 성공 응답 전에 보정 성공으로 표현하지 않는다. 통합 검색의 progress가 실제 조정 전후를 제공한 경우에는 그 데이터만 보간한다.

검색 완료 시 기존 후보 화면으로 바로 전환하며 애니메이션을 기다리지 않는다. 기록에서
결과를 불러오는 동안은 `이전 분석 결과를 불러오고 있어요`를 표시하고, 남아 있는 다른
입력 초안의 미리보기를 표시하지 않는다. 홈·처음으로 이동하는 기존 버튼은 유지한다.

---

## 10. 후보 뷰어

### 카드 상태

- Default: white / border
- Hover: Ink 30% border
- Selected: Coral 2px + check
- Keyboard focus: Sky ring
- Low confidence: Warning badge
- Loading: skeleton placeholder

### 선택 정보

`가장 정확함` 같은 정확도 단정 대신, `matchLevel`을 라벨/뱃지로 표시한다(매핑 정본은 `docs/08_API_CONTRACT.md` §6).

- high → `높은 일치`
- medium → `유사`
- low → `보정 필요` (Warning 뱃지)

`matchLevel`과 별개로 `tags`(무엇이 유사한지)를 서술 태그로 함께 노출한다.

- `동작 유사`
- `상체 방향 유사`
- `측면`

### 큰 뷰어

- Canvas background
- Orbit control
- Reset view
- 이미지 비교 toggle
- 좌우 전환 단축키
- 후보 번호 표시

---

## 11. 알림과 오류

### Toast

사용:
- 저장 완료
- 캡처 완료
- 단축키 변경
- 복사 완료

> **현행 편차(docs/05 §8):** Toast 컴포넌트는 아직 없다. 단축키 변경 결과는 설정 화면 안의
> `aria-live` 문구로 알리고, 등록 실패는 복구 행동(다른 키 선택)이 필요하므로 아래 규칙에 따라
> 인라인 오류 + 되돌리기 버튼으로 처리한다. Toast 도입 시 성공 알림만 옮긴다.

Toast로 처리하지 않을 것:
- 로그인 폼 오류
- 캡처 권한 거부
- 분석 실패
- 파일 손상

복구 행동이 필요한 오류는 화면 또는 dialog로 보여준다.

---

## 12. 다크 모드

이번 주 필수 아님.

구현한다면:
- Canvas 색은 유지
- Paper를 어두운 베이지로 단순 반전하지 않음
- Coral 사용량을 줄이고 명도 대비 확인
- 시스템 테마를 기본값으로

---

## 13. 접근성

- 모든 주요 동작 키보드 접근
- 후보 카드 `aria-pressed`
- 단축키를 화면에 표시
- 캡처 시작 전 Escape 취소 안내
- 포커스가 모달 뒤로 이동하지 않음
- 최소 44×44px 터치·클릭 영역
- 색상 외 아이콘과 텍스트 병행
- 애니메이션 reduced motion 대응

### 로딩 구간 확장

세부 구간은 선택적 Job `progress` v1 snapshot의 6단계(analyzing/extracting/understanding/searching/refining/ranking)를 따른다. 원본 러프 위의 주요 COCO 관절, 관측 키워드, 실제 검색 경로의 한국어 문구, 준비된 후보 썸네일과 순서, 실제 조정 전후만 표시한다. completed/skipped는 서버 명시값만 사용한다. 없는 데이터는 만들지 않으며 새 렌더/VLM/refine 요청을 시작하지 않는다. 구 서버에는 optional stage와 일반 running 로딩을 유지한다. 자세한 계약은 POSE_ANALYSIS_PROGRESS_V1.md를 따른다.
