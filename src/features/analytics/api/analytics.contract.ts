/**
 * 분석 이벤트·선택 확정·피드백의 **전송 계약**.
 *
 * 큐·배치·재시도·일시정지 같은 클라이언트 동작은 `analyticsClient.ts`가 그대로 소유한다.
 * 여기로 뺀 것은 네트워크 경계 하나뿐이다 — Mock 모드에서 갈아끼울 수 있어야 하는 부분이
 * 그것뿐이기 때문이다.
 */

export type AnalyticsEventPayload = {
  eventId: string;
  name: string;
  occurredAt: string;
  sequence: number;
  jobId?: string;
  properties: Record<string, unknown>;
};

export interface AnalyticsService {
  /** 이벤트 배치 전송. 실패는 호출측이 재시도 가능/영구 거절로 갈라 처리한다. */
  sendEvents(input: { events: AnalyticsEventPayload[] }): Promise<void>;
  /** 인물별 최종 선택 확정. 저장 화면으로 넘어가기 전 관문이다. */
  confirmSelections(input: {
    jobId: string;
    selections: Array<{ personIndex: number; candidateId: string }>;
  }): Promise<void>;
  submitFeedback(input: { jobId: string; reason: string }): Promise<void>;
}
