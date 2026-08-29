# Architecture Decision Records (ADR)

이 폴더는 Standin Desktop 앱의 되돌리기 어려운 기술 결정을 기록한다.

`docs/02_APP_ARCHITECTURE.md` §10에서 지정한 결정 항목을 각 ADR로 관리한다.

## 상태 규칙

- `제안됨(Proposed)`: 권장안이 있으나 팀 합의 전
- `승인됨(Accepted)`: 팀이 합의하고 구현에 반영
- `대체됨(Superseded)`: 이후 ADR로 교체됨. 대체 ADR 번호를 명시
- `보류(Deferred)`: 이번 주 범위 밖. 재검토 시점을 명시

## 작성 규칙

- 결정 하나당 파일 하나
- 결정은 되돌릴 때 비용이 큰 것만 기록한다. 일반 코드 스타일은 lint/포맷터로 관리
- 문서와 구현이 충돌하면 `docs/05_REPOSITORY_AND_COLLABORATION.md` §8에 따라 PR에서 맞춘다

## 목록

| ADR | 제목 | 상태 |
|---|---|---|
| [ADR-001](ADR-001-styling.md) | 스타일링 방식 | 제안됨 |
| [ADR-002](ADR-002-auth-token-storage.md) | 인증 토큰 저장 방식 | 제안됨 |
| [ADR-003](ADR-003-capture-implementation.md) | 화면 캡처 구현 방식 | 제안됨 |
| [ADR-004](ADR-004-analysis-status-delivery.md) | 분석 상태 전달 방식 | 제안됨 |
| [ADR-005](ADR-005-3d-viewer-timing.md) | 3D 뷰어 도입 시점 | 제안됨 |
| [ADR-006](ADR-006-bvh-download.md) | BVH 다운로드 방식 | 제안됨 (저장 UX는 ADR-009로 보완) |
| [ADR-007](ADR-007-global-shortcut-registration.md) | 전역 단축키 등록 계층 | 제안됨 |
| [ADR-008](ADR-008-window-modes.md) | 플로팅 바의 창 구조 | 제안됨 |
| [ADR-009](ADR-009-pose-file-delivery.md) | 포즈 파일을 클립스튜디오로 전달하는 방식 | 제안됨 |
| [ADR-010](ADR-010-refine-review-step.md) | 저장 전 조정 결과 확인 단계 | 제안됨 (ADR-005·009 보완) |
| [ADR-011](ADR-011-signing-and-update-delivery.md) | 앱 서명과 자동 업데이트 배포 방식 | 제안됨 |
| [ADR-012](ADR-012-job-history-reentry.md) | 작업 기록에서 지난 분석으로 다시 들어가는 방식 | 제안됨 |

## 템플릿

```md
# ADR-00N: 제목

- 상태: 제안됨 | 승인됨 | 대체됨 | 보류
- 날짜: YYYY-MM-DD
- 관련 문서: docs/...

## 배경
결정이 필요한 이유와 제약.

## 선택지
각 안의 장단점.

## 결정
선택한 안과 근거.

## 결과
이 결정으로 생기는 후속 작업, 감수하는 트레이드오프, 재검토 조건.
```
