import type { AnalysisPersonProgress, SkeletonOverlay } from "../api/analysisProgress";

export type FocusBounds = { x: number; y: number; width: number; height: number };

/** Camera framing only: no missing joint is invented or added to the observation. */
export function skeletonFocus(
  ...overlays: (SkeletonOverlay | undefined)[]
): FocusBounds | undefined {
  const points = overlays.flatMap(
    (s) => s?.points.slice(5).filter((p): p is [number, number] => !!p) ?? [],
  );
  if (new Set(points.map((point) => point.join(","))).size < 4) return undefined;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const width = Math.min(1, Math.max(0.28, (maxX - minX) * 1.42));
  const height = Math.min(1, Math.max(0.35, (maxY - minY) * 1.36));
  const x = Math.max(0, Math.min(1 - width, (minX + maxX - width) / 2));
  const y = Math.max(0, Math.min(1 - height, (minY + maxY - height) / 2 - 0.025));
  return { x, y, width, height };
}

/** A projected point moved. This does not claim the optimizer rotated that exact joint. */
export function movedJoints(before?: SkeletonOverlay, after?: SkeletonOverlay): number[] {
  if (!before || !after) return [];
  return after.points.flatMap((p, index) => {
    const previous = before.points[index];
    return index >= 5 && p && previous && Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 0.002
      ? [index]
      : [];
  });
}

export function refinementJoints(refinement?: AnalysisPersonProgress["refinement"]) {
  if (!refinement || ["unchanged", "reverted", "skipped"].includes(refinement.status)) return [];
  return refinement.activeJoints?.length
    ? refinement.activeJoints
    : refinement.status === "improved"
      ? movedJoints(refinement.before, refinement.after)
      : [];
}

export const JOINT_LABELS: Record<number, string> = {
  5: "왼쪽 어깨",
  6: "오른쪽 어깨",
  7: "왼쪽 팔꿈치",
  8: "오른쪽 팔꿈치",
  9: "왼쪽 손목",
  10: "오른쪽 손목",
  11: "왼쪽 골반",
  12: "오른쪽 골반",
  13: "왼쪽 무릎",
  14: "오른쪽 무릎",
  15: "왼쪽 발목",
  16: "오른쪽 발목",
};
