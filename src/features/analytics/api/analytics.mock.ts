import type { AnalyticsEventPayload, AnalyticsService } from "./analytics.contract";

/**
 * Mock 모드의 전송. 전부 성공으로 받는다.
 *
 * 이게 없으면 Mock 모드가 후보 화면에서 막힌다. 선택 확정만 실서버로 나가는데 Mock의
 * jobId는 클라가 만든 `crypto.randomUUID()`라 서버가 모르는 job이라서, "선택을 저장하지
 * 못했습니다"가 뜨고 저장 화면까지 갈 수가 없었다.
 *
 * ⚠ 실패를 흉내 내지 않는다. 재시도·영구 거절·일시정지 분기는 `analyticsClient`의 몫이고
 * 그 동작은 `analyticsClient` 테스트가 apiFetch를 직접 세워 검증한다 — 여기서 무작위로
 * 실패시키면 Mock 모드가 이유 없이 불안정해질 뿐이다.
 */
const sent: { events: AnalyticsEventPayload[]; selections: number; feedback: number } = {
  events: [],
  selections: 0,
  feedback: 0,
};

/** 개발 중 "이벤트가 실제로 나갔는가"를 확인할 때 콘솔에서 부른다. */
export function __mockAnalyticsSent() {
  return sent;
}

export const analyticsMock: AnalyticsService = {
  async sendEvents({ events }): Promise<void> {
    sent.events.push(...events);
  },
  async confirmSelections(): Promise<void> {
    sent.selections += 1;
  },
  async submitFeedback(): Promise<void> {
    sent.feedback += 1;
  },
};
