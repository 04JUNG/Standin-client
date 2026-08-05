import type { RefineOutcome, RefineService } from "./refine.contract";

/**
 * 브라우저 개발용 Mock. 적용/스킵 두 화면을 모두 볼 수 있어야 하므로 인물별로 갈라 준다.
 * 실제 조정은 추론 서버가 한다(CLAUDE.md §5 서버와 앱의 분리).
 */
export const refineMock: RefineService = {
  async refineSelection({ jobId, personIndex, candidateId }): Promise<RefineOutcome> {
    await new Promise((r) => setTimeout(r, 400));
    const refined = personIndex % 2 === 0;
    return {
      jobId,
      personIndex,
      candidateId,
      refined,
      reasonCode: refined ? "ok_partial" : "no_gain",
      adjustedLimbs: refined ? ["left_arm"] : [],
      exportUrl: `/mock/${jobId}/${personIndex}/${candidateId}.bvh`,
    };
  },
};
