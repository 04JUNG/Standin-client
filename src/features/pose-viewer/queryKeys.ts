/** docs/09 §6 key 컨벤션을 따르되 이 기능에만 스코프한다. */
export const poseQueryKeys = {
  result: (jobId: string) => ["analysis", "result", jobId] as const,
};
