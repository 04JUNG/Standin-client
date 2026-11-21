import { describe, expect, it } from "vitest";
import pipeline from "@/test/fixtures/analysis-progress/pipeline-v1.json";
import outcomes from "@/test/fixtures/analysis-progress/contract-cases-v1.json";
import focusCases from "@/test/fixtures/analysis-progress/focus-v1.json";
import sceneCases from "@/test/fixtures/analysis-progress/scene-v1.json";
import { readAnalysisProgress } from "./analysisProgress";
import { mergeAnalysisProgress, type AnalysisProgress } from "../lib/loadingProgress";

// Captured by the producer's production pipeline, then the BFF production allowlist.
// Input models are OFFLINE mocks. Refine outcomes are separate synthetic contract cases.
describe("BFF v1 response compatibility", () => {
  it.each([...pipeline.cases, ...outcomes.cases, ...focusCases.cases, ...sceneCases.cases])(
    "accepts $name without losing observations or stage history",
    (c) => {
      let progress: AnalysisProgress | null = null;
      for (const wire of c.snapshots) {
        const snapshot = readAnalysisProgress(wire);
        expect(snapshot).toBeDefined();
        if ("focus" in wire) expect(snapshot?.focus).toEqual(wire.focus);
        if ("scene" in wire) expect(snapshot?.scene).toEqual(wire.scene);
        progress = mergeAnalysisProgress(progress, snapshot!.stage, snapshot);
        expect(progress.snapshot?.sequence).toBe(wire.sequence);
        expect(
          progress.snapshot?.completedStages.some((stage) =>
            progress?.snapshot?.skippedStages.includes(stage),
          ),
        ).toBe(false);
      }
      expect(progress?.snapshot?.people).toEqual(c.snapshots.at(-1)?.people);
    },
  );
});
