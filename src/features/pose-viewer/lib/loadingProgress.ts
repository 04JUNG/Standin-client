/** Transport milestones are observed; percentages between them are estimates. */
import { ANALYSIS_STAGES, type AnalysisSnapshot } from "../api/analysisProgress";
export const POSE_LOADING_STAGES = ANALYSIS_STAGES;
export type PoseLoadingStage = (typeof POSE_LOADING_STAGES)[number];
export const LOADING_STAGE_LABELS: Record<PoseLoadingStage, string> = {
  analyzing: "러프 확인",
  extracting: "자세 읽기",
  understanding: "동작 이해",
  searching: "포즈 찾기",
  refining: "러프 맞춤",
  ranking: "후보 정리",
};
export type AnalysisPhase = "uploading" | "queued" | "running" | "preparing" | PoseLoadingStage;
export type AnalysisProgress = {
  phase: AnalysisPhase;
  enteredAt: number;
  snapshot?: AnalysisSnapshot;
  estimateFloor?: number;
};
export type LoadingPhase = AnalysisPhase;

const RANGES: Record<LoadingPhase, [number, number, number]> = {
  uploading: [3, 12, 6_000],
  queued: [12, 24, 20_000],
  running: [28, 92, 24_000],
  preparing: [98, 98, 5_000],
  analyzing: [26, 34, 8_000],
  extracting: [35, 44, 8_000],
  understanding: [45, 53, 8_000],
  searching: [54, 70, 12_000],
  refining: [72, 88, 12_000],
  ranking: [90, 98, 5_000],
};

/** Optional Job.stage extension. Unknown stages preserve the legacy transport state. */
export function readAnalysisStage(stage: unknown): PoseLoadingStage | undefined {
  return typeof stage === "string" && POSE_LOADING_STAGES.some((value) => value === stage)
    ? (stage as PoseLoadingStage)
    : undefined;
}

export function loadingVisualStage(phase: LoadingPhase): PoseLoadingStage {
  if (phase === "uploading" || phase === "queued") return "analyzing";
  if (phase === "running") return "searching";
  if (phase === "preparing") return "ranking";
  return phase;
}

/** Never promises completion: successful responses, not timers, end loading. */
export function estimateLoadingProgress(phase: LoadingPhase, elapsedMs: number): number {
  const [start, ceiling, scale] = RANGES[phase];
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return Math.floor(start + (ceiling - start) * (1 - Math.exp(-elapsed / scale)));
}

/** Job-scoped cache reducer. A polling repeat or an old packet cannot replay a scene. */
export function mergeAnalysisProgress(
  previous: AnalysisProgress | null | undefined,
  phase: AnalysisPhase,
  snapshot?: AnalysisSnapshot,
  now = Date.now(),
): AnalysisProgress {
  if (snapshot && previous?.snapshot && snapshot.sequence <= previous.snapshot.sequence)
    return previous;
  if (!snapshot && previous?.snapshot && phase !== "preparing") return previous;
  if (previous?.phase === phase && !snapshot) return previous;
  return {
    phase,
    enteredAt: previous?.phase === phase ? previous.enteredAt : now,
    estimateFloor: previous
      ? Math.max(
          previous.estimateFloor ?? 0,
          estimateLoadingProgress(previous.phase, now - previous.enteredAt),
        )
      : 0,
    ...(snapshot ? { snapshot } : {}),
  };
}
