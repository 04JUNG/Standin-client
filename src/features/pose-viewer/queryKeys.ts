/** docs/09 §6 key 컨벤션을 따르되 이 기능에만 스코프한다. */
export const poseQueryKeys = {
  /**
   * 분석 계열 전체의 prefix. 분석이 진행 중인지 다른 기능이 물을 때 쓴다
   * (설정 화면의 업데이트 설치가 이걸로 재시작 시점을 미룬다, ADR-011).
   */
  all: ["analysis"] as const,
  result: (jobId: string) => ["analysis", "result", jobId] as const,
};
