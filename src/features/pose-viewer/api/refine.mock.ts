import type { RefineOutcome, RefineService } from "./refine.contract";

/** 조정본이라는 것만 알아볼 수 있으면 되는 자리표시자 SVG. */
function mockPreview(personIndex: number): string {
  const hue = (personIndex * 67) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="hsl(${hue} 60% 88%)"/>` +
    `<circle cx="32" cy="20" r="8" fill="hsl(${hue} 45% 45%)"/>` +
    `<rect x="26" y="30" width="12" height="24" rx="4" fill="hsl(${hue} 45% 45%)"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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
      // 그림이 있는 경우와 없는 경우를 둘 다 볼 수 있어야 한다. 미리보기가 없을 때
      // 후보 썸네일로 폴백하는 화면이 실제로 도는지 확인하려면 빈 값도 필요하다.
      previewUrl: refined ? mockPreview(personIndex) : "",
    };
  },
};
