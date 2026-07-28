/**
 * 흐름이 어디서 시작됐는지(ADR-008).
 *
 * 앱 모드와 바 모드가 같은 오케스트레이션을 공유하되 목적지만 다르다. 각 단계에서
 * 분기하지 않도록 진입 시점에 origin을 기록하고 라우트를 여기서 한 번에 계산한다.
 */
export type FlowOrigin = "app" | "bar";

/** 입력(캡처·업로드)을 받은 다음 단계. */
export function afterInputRoute(origin: FlowOrigin): string {
  // 바는 미리보기 단계를 건너뛰고 바로 분석에 들어간다("적은 동작" 원칙).
  return origin === "bar" ? "/bar/progress" : "/app/preview";
}

/** 분석이 끝나고 후보를 보여줄 곳. */
export function candidatesRoute(origin: FlowOrigin, jobId: string): string {
  return origin === "bar" ? "/bar/candidates" : `/app/jobs/${jobId}`;
}

/** 후보를 고르고 저장하러 갈 곳. */
export function saveRoute(origin: FlowOrigin, jobId: string): string {
  return origin === "bar" ? "/bar/save" : `/app/jobs/${jobId}/save`;
}

/** 흐름을 접거나 취소했을 때 돌아갈 곳. */
export function idleRoute(origin: FlowOrigin): string {
  return origin === "bar" ? "/bar/actions" : "/app/home";
}
