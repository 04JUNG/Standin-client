import { expect, it } from "vitest";
import type { RefineOutcome } from "../api/refine.contract";
import { refineResultStatus } from "./selectedRefineProgress";
it.each([
  [true, "ok_partial", "improved"],
  [false, "no_gain", "unchanged"],
  [false, "feature_disabled", "skipped"],
  [false, "skeleton_policy", "skipped"],
  [false, "no_solvable_joints", "skipped"],
  [false, "safety_reverted", "reverted"],
  [false, "rc4_withheld", "reverted"],
  [false, "upstream_unavailable", "failed"],
  [false, "artifact_store_failed", "failed"],
] as const)("classifies actual result %s/%s as %s", (refined, reasonCode, status) => {
  expect(refineResultStatus({ refined, reasonCode } as RefineOutcome)).toBe(status);
});
