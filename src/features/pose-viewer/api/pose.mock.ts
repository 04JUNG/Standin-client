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

function buildCandidates(jobId: string, personIndex: number): PoseCandidate[] {
  return CANDIDATE_LEVELS.map((matchLevel, index) => {
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

    // 다인 컷 UI를 개발 중에도 확인할 수 있도록 인물 2명을 흉내낸다.
    const people: PersonResult[] = [
      { index: 0, candidates: buildCandidates(jobId, 0) },
      { index: 1, candidates: buildCandidates(jobId, 1) },
    ];

    return { jobId, people };
  },
};
