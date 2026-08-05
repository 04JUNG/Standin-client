import type { AnalysisResult, MatchLevel, PersonResult, PoseCandidate, PoseResultService } from "./pose.contract";

/**
 * 브라우저(Vite) 개발용 Mock. capture.mock.ts와 동일하게 canvas로 플레이스홀더 썸네일을 만든다.
 * 실제 VLM·포즈 검색은 이번 범위 밖(CLAUDE.md §2).
 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MATCH_COLORS: Record<MatchLevel, { bg: string; text: string }> = {
  high: { bg: "#dff4fb", text: "#0f5c78" },
  medium: { bg: "#fdf1d6", text: "#8a5a10" },
  low: { bg: "#fde3df", text: "#a03a2c" },
};

function createThumbnail(rank: number, matchLevel: MatchLevel): string {
  const size = 240;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const { bg, text } = MATCH_COLORS[matchLevel];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = text;
  ctx.globalAlpha = 0.15;
  for (let i = 20; i < size; i += 24) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = text;
  ctx.textAlign = "center";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`후보 ${rank}`, size / 2, size / 2 - 8);
  ctx.font = "14px sans-serif";
  ctx.fillText("MOCK 썸네일", size / 2, size / 2 + 20);

  return canvas.toDataURL("image/png");
}

const CANDIDATE_LEVELS: MatchLevel[] = ["high", "high", "medium", "medium", "low"];

function buildCandidates(
  jobId: string,
  personIndex: number,
  levels: MatchLevel[] = CANDIDATE_LEVELS,
): PoseCandidate[] {
  return levels.map((matchLevel, index) => {
    const rank = index + 1;
    const thumbnailUrl = createThumbnail(rank, matchLevel);
    return {
      id: `${jobId}-p${personIndex}-candidate-${rank}`,
      poseId: `${jobId}-p${personIndex}-pose-${rank}`,
      rank,
      title: `포즈 후보 ${rank}`,
      tags: rank % 2 === 0 ? ["전신", "정면"] : ["상반신", "측면"],
      matchLevel,
      thumbnailUrl,
      previewImages: [{ view: "front", url: thumbnailUrl }],
      modelUrl: null,
      bvhAvailable: true,
    };
  });
}

export const poseMock: PoseResultService = {
  async analyze({ jobId }: { jobId: string; file: File }): Promise<AnalysisResult> {
    await delay(600);

    // 다인 컷과 **세 가지 폴백 상태를 모두** 개발 중에 확인할 수 있게 흉내낸다.
    // 셋을 다 넣지 않으면 soft/hard 화면은 실서버에 붙기 전까지 아무도 보지 못한다.
    const people: PersonResult[] = [
      {
        index: 0,
        candidates: buildCandidates(jobId, 0),
        confidence: "high",
        skeletonState: "valid",
        skeletonSource: "full_image",
        coverageClass: "full",
        fallbackMode: "none",
        refineAllowed: true,
        refinableLimbs: ["left_arm", "right_arm"],
      },
      {
        // soft — 후보는 있지만 스켈레톤 인식이 불확실하다. refine 금지.
        index: 1,
        candidates: buildCandidates(jobId, 1, ["low", "low", "low", "low", "low"]),
        confidence: "low",
        skeletonState: "partial",
        skeletonSource: "crop_retry",
        coverageClass: "reduced",
        fallbackMode: "soft",
        refineAllowed: false,
        refinableLimbs: [],
      },
      {
        // hard — 자동 후보가 없다. 다른 인물의 선택·저장은 계속 가능해야 한다.
        index: 2,
        candidates: [],
        confidence: "low",
        skeletonState: "missing",
        skeletonSource: "none",
        coverageClass: "insufficient",
        fallbackMode: "hard",
        refineAllowed: false,
        refinableLimbs: [],
      },
    ];

    return { jobId, people, capabilities: { refine: true } };
  },
};
