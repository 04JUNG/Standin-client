import { mockOutputScope } from "./outputScope";
import { bodyMockEnabled, registerMockPeople } from "@/features/body-selection/mock";
import type {
  AnalysisResult,
  MatchLevel,
  PersonResult,
  PoseCandidate,
  PoseResultService,
} from "./pose.contract";

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
  /** Mock에는 저장소가 없다. 기록에서 열어도 analyze와 같은 결과를 보여준다. */
  async loadResult({ jobId }: { jobId: string }): Promise<AnalysisResult> {
    return poseMock.analyze({
      jobId,
      file: new File([], "mock.png", { type: "image/png" }),
      source: "file",
      width: 0,
      height: 0,
    });
  },

  async analyze({
    jobId,
    width = 0,
    height = 0,
  }: {
    jobId: string;
    file: File;
    width?: number;
    height?: number;
  }): Promise<AnalysisResult> {
    await delay(600);
    // 원본 패널을 볼 수 있게 올린 그림을 세로로 셋 나눈 상자를 준다(실제 검출이 아니다).
    const box = (i: number): PersonResult["box"] =>
      width > 0 && height > 0
        ? [
            (width / 3) * i + width * 0.02,
            height * 0.04,
            (width / 3) * (i + 1) - width * 0.02,
            height * 0.98,
          ]
        : null;

    // 다인 컷과 soft 폴백을 개발 중에 확인할 수 있게 흉내낸다. 세 인물 모두 후보가 있다
    // (hard 폴백 화면은 PersonFallbackNotice 테스트로 확인한다).
    const people: PersonResult[] = [
      {
        index: 0,
        box: box(0),
        outputScope: mockOutputScope(jobId, 0, "full"),
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
        box: box(1),
        outputScope: mockOutputScope(jobId, 1, "half"),
        candidates: buildCandidates(jobId, 1, ["low", "low", "low", "low", "low"]),
        confidence: "low",
        skeletonState: "partial",
        skeletonSource: "full_image",
        coverageClass: "upper_only",
        fallbackMode: "soft",
        refineAllowed: false,
        refinableLimbs: [],
      },
      {
        // 세 번째 인물도 후보를 보여 준다(뒷모습처럼 일치도가 낮은 인물).
        index: 2,
        box: box(2),
        outputScope: mockOutputScope(jobId, 2, "full"),
        candidates: buildCandidates(jobId, 2, ["medium", "medium", "low", "low", "low"]),
        confidence: "high",
        skeletonState: "valid",
        skeletonSource: "full_image",
        coverageClass: "full",
        fallbackMode: "none",
        refineAllowed: false,
        refinableLimbs: [],
      },
    ];

    const bodies = bodyMockEnabled();
    if (bodies) registerMockPeople(jobId, people);
    return {
      jobId,
      people,
      capabilities: {
        bodyPreviews: bodies,
        bodyPreviewAssets: bodies,
        refine: true,
        fbxExport: true,
        characterSelection: true,
        outputScopeSelection: true,
        outputScopeCropping: false,
      },
    };
  },
};
