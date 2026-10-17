import { describe, expect, it } from "vitest";
import { canRelease, readCandidatePolicy, reviewOnly } from "./routedSearch";
import type { PoseCandidate } from "./pose.contract";

describe("routed candidate permissions", () => {
  it("closes forged permissions and preserves rank units", () => {
    const policy = readCandidatePolicy({
      source: "dynamic",
      releaseAllowed: true,
      refineAllowed: true,
      rankScore: 0.01,
    });
    expect(policy).toMatchObject({
      source: "dynamic",
      releaseAllowed: false,
      refineAllowed: false,
      actualMeshValidated: false,
      rankScore: 0.01,
    });
    expect(reviewOnly(policy)).toBe(true);
    expect(canRelease(policy as PoseCandidate)).toBe(false);
  });
  it("unknown sources fail closed; old candidates retain existing behavior", () => {
    expect(reviewOnly(readCandidatePolicy({ source: "future" } as never))).toBe(true);
    expect(canRelease({ id: "legacy" } as PoseCandidate)).toBe(true);
    expect(canRelease(undefined)).toBe(false);
  });
});
