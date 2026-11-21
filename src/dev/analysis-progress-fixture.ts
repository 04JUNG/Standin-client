// DEV-only contract replay. Coordinates/tags are illustrative, not inference output.
// PNGs are existing Standin model QA renders (female-muscle-refine-v0.3.1); no runtime rendering.
import {
  ANALYSIS_STAGES,
  type AnalysisSnapshot,
  type SkeletonOverlay,
} from "@/features/pose-viewer/api/analysisProgress";
import candidate1 from "./progress-assets/candidate-1.png";
import candidate2 from "./progress-assets/candidate-2.png";
import candidate3 from "./progress-assets/candidate-3.png";
import candidate4 from "./progress-assets/candidate-4.png";
import candidate5 from "./progress-assets/candidate-5.png";
export const previewCandidates = [candidate1, candidate2, candidate3, candidate4, candidate5].map(
  (thumbnailUrl, i) => ({
    id: `example-${i}`,
    rank: i + 1,
    thumbnailUrl,
  }),
);
const pixels = [
  [157, 49],
  null,
  null,
  null,
  null,
  [129, 97],
  [173, 90],
  [103, 145],
  [213, 78],
  [77, 181],
  [237, 38],
  [140, 185],
  [170, 185],
  [123, 241],
  [195, 238],
  [111, 286],
  [219, 287],
];
export const exampleSkeleton: SkeletonOverlay = {
  format: "coco17",
  coordinateSpace: "image-normalized",
  points: pixels.map((point) => (point ? [(point[0] - 35) / 250, (point[1] - 5) / 315] : null)),
};
const before = structuredClone(exampleSkeleton);
before.points[8] = [0.67, 0.34];
before.points[10] = [0.76, 0.25];
export function exampleSnapshot(
  stage: AnalysisSnapshot["stage"],
  options: {
    sequence?: number;
    partial?: boolean;
    multi?: boolean;
    unassigned?: boolean;
    outcome?: NonNullable<AnalysisSnapshot["people"][number]["refinement"]>["status"];
  } = {},
): AnalysisSnapshot {
  const index = ANALYSIS_STAGES.indexOf(stage);
  const skeleton = structuredClone(exampleSkeleton);
  if (options.partial) for (const i of [13, 14, 15, 16]) skeleton.points[i] = null;
  const person: AnalysisSnapshot["people"][number] = {
    personIndex: 0,
    ...(index >= 1 ? { skeleton } : {}),
    ...(index >= 2
      ? {
          observations: [
            { id: "arm-raised", label: "오른팔 들기" },
            { id: "wide-stance", label: "벌린 다리" },
            { id: "torso", label: "몸통 기울임" },
          ],
          searchMode: "combined" as const,
        }
      : {}),
    ...(index >= 3 ? { candidates: previewCandidates } : {}),
    ...(index >= 4
      ? {
          refinement: {
            candidateId: "example-0",
            status: options.outcome ?? "improved",
            before,
            ...(["running", "improved"].includes(options.outcome ?? "improved")
              ? { activeJoints: [8, 10] }
              : {}),
            ...((options.outcome ?? "improved") === "improved" ? { after: skeleton } : {}),
          },
        }
      : {}),
  };
  const project = (
    overlay: SkeletonOverlay,
    x: number,
    y: number,
    scale: number,
  ): SkeletonOverlay => ({
    ...overlay,
    points: overlay.points.map((point) =>
      point
        ? [(x + scale * (35 + point[0] * 250)) / 720, (y + scale * (5 + point[1] * 315)) / 420]
        : null,
    ),
  });
  const multiPerson = (
    personIndex: number,
    x: number,
    y: number,
    scale: number,
  ): typeof person => ({
    ...person,
    personIndex,
    ...(person.skeleton ? { skeleton: project(person.skeleton, x, y, scale) } : {}),
    ...(person.refinement
      ? {
          refinement: {
            ...person.refinement,
            before: project(person.refinement.before!, x, y, scale),
            ...(person.refinement.after
              ? { after: project(person.refinement.after, x, y, scale) }
              : {}),
          },
        }
      : {}),
  });
  return {
    version: "pose-analysis-progress.v1",
    sequence: options.sequence ?? index + 1,
    stage,
    updatedAt: "2026-11-06T04:00:00Z",
    completedStages: ANALYSIS_STAGES.slice(0, index),
    skippedStages: [],
    ...(index >= 1
      ? {
          scene: {
            shot: "full_half" as const,
            view: "three_quarter" as const,
            personCount: options.multi ? 2 : 1,
          },
        }
      : {}),
    ...(options.multi && options.unassigned && index >= 1
      ? {
          focus: {
            id: "observed-body-1",
            skeleton: multiPerson(1, 355, 5, 1.05).skeleton!,
            observations: person.observations,
            searchMode: person.searchMode,
          },
        }
      : {}),
    activePersonIndex: options.unassigned ? undefined : options.multi ? 1 : 0,
    people: options.unassigned
      ? []
      : options.multi
        ? [multiPerson(0, 30, 40, 0.95), multiPerson(1, 355, 5, 1.05)]
        : [person],
  };
}
