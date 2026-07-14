# ADR-004: 분석 상태 전달 방식

- 상태: 제안됨
- 날짜: 2026-07-14
- 관련 문서: docs/02_APP_ARCHITECTURE.md §8, docs/08_API_CONTRACT.md §5, docs/09_STATE_AND_DATA_MODEL.md §7

## 배경

서버 분석은 오래 걸릴 수 있어 Job 모델로 진행한다. 앱이 상태를 어떻게 받아 화면 단계형 progress로 보여줄지 결정해야 한다. 서버가 제공하지 않는 가짜 퍼센트는 만들지 않는다는 원칙이 있다(docs/08 §1).

제약:

- 상태 enum과 `stage.current/total`은 서버가 제공할 때만 사용(docs/08 §5).
- background로 이동해도 작업 상태 유지(docs/03 §6).
- 서버의 상태 전달 능력(polling/SSE/WebSocket)이 아직 미확정(docs/08 §11 Q5).

## 선택지

### A. Polling (TanStack Query `refetchInterval`) — 권장

- 완료/실패/취소가 아니면 약 1.5초 간격 재조회(docs/09 §7).
- 장점: 구현 단순, 서버 요구가 REST 하나로 충분, 재연결/재시도 자연 처리. MVP 권장(docs/02 §8).
- 단점: 상태 반영에 최대 폴링 간격만큼 지연. 유휴 요청 발생.

### B. Server-Sent Events

- 장점: 서버 푸시로 지연 감소, 단방향이라 구현 부담이 WebSocket보다 낮음.
- 단점: 서버 지원 필요. Tauri 웹뷰/프록시 환경 검증 필요.

### C. WebSocket

- 장점: 실시간 양방향.
- 단점: MVP 요구(단계 표시)에 과함. 서버·인프라 부담.

## 결정

**A. Polling**을 MVP 기본으로 채택한다. 상태 폴링 로직은 전송 방식과 분리된 서비스 계층 뒤에 둔다.

근거:

- 이번 주 실제 분석 화면은 P2(placeholder)라(docs/10 §2) 단순·안정적 방식이 적합.
- 서버가 SSE를 제공하기로 확정되면 서비스 계층 교체로 이행 가능.

## 결과

- `refetchInterval`은 상태가 `completed|failed|cancelled`면 중단(docs/09 §7).
- 앱이 background일 때 폴링 간격을 늘려 자원 절약(docs/09 §7 주석).
- 단계 표시는 `stage.current/total`이 있을 때만 단계형, 없으면 spinner + 단계 라벨(docs/04 §9). 가짜 퍼센트 금지.
- Job 취소는 서버 지원 여부에 따라 "화면에서 숨기기"와 실제 취소를 구분(docs/08 §9).
- 서버팀 확인(docs/08 §11 Q5, Q6): 상태 전달 방식, 단계별 상태 제공 가능 여부.
- 재검토 조건: 폴링 지연이 UX를 해치거나 서버가 SSE를 확정하면 B로 재평가.
