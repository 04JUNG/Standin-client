import { describe, expect, it } from "vitest";
import { ANALYSIS_STAGES } from "../api/analysisProgress";
import {
  estimateLoadingProgress,
  loadingVisualStage,
  readAnalysisStage,
  type LoadingPhase,
} from "./loadingProgress";

describe("estimated loading progress", () => {
  it.each<LoadingPhase>(["uploading", "queued", "running", "preparing", ...ANALYSIS_STAGES])(
    "%s stays below completion even during a long or malformed wait",
    (phase) => {
      const samples = [-100, 0, 5_000, 60_000, 3_600_000].map((ms) =>
        estimateLoadingProgress(phase, ms),
      );
      expect(samples.every((value) => value >= 0 && value < 100)).toBe(true);
      expect(samples).toEqual([...samples].sort((a, b) => a - b));
      expect(estimateLoadingProgress(phase, Number.NaN)).toBe(samples[0]);
    },
  );
  it("accepts only explicit supported stages and leaves legacy running as search", () => {
    for (const stage of ANALYSIS_STAGES) expect(readAnalysisStage(stage)).toBe(stage);
    for (const value of [undefined, null, "done", "refine", {}, 42])
      expect(readAnalysisStage(value)).toBeUndefined();
    for (const phase of ["running", "ranking", "preparing"] as const)
      expect(loadingVisualStage(phase)).toBe("searching");
  });
  it("keeps integrated pipeline estimates monotonic at every stage boundary", () => {
    for (let i = 0; i < ANALYSIS_STAGES.length - 1; i++)
      expect(estimateLoadingProgress(ANALYSIS_STAGES[i], 3_600_000)).toBeLessThanOrEqual(
        estimateLoadingProgress(ANALYSIS_STAGES[i + 1], 0),
      );
    expect(estimateLoadingProgress("ranking", 3_600_000)).toBeLessThanOrEqual(
      estimateLoadingProgress("preparing", 0),
    );
  });
  it("does not regress at observed transport milestones", () => {
    expect(estimateLoadingProgress("uploading", 3_600_000)).toBeLessThanOrEqual(
      estimateLoadingProgress("queued", 0),
    );
    expect(estimateLoadingProgress("queued", 3_600_000)).toBeLessThanOrEqual(
      estimateLoadingProgress("running", 0),
    );
    expect(estimateLoadingProgress("running", 3_600_000)).toBeLessThanOrEqual(
      estimateLoadingProgress("preparing", 0),
    );
  });
});
