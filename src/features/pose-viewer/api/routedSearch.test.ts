import { describe, expect, it } from "vitest";
import { canRelease, readCandidatePolicy, reviewOnly } from "./routedSearch";
import type { PoseCandidate } from "./pose.contract";

describe("routed candidate permissions", () => {
  it("allows explicit library selection only with the BFF's source hash and release permission", () => {
    const raw = {
      source: "library" as const,
      lookupAllowed: true,
      releaseAllowed: true,
      sourceBvhSha256: "a".repeat(64),
    };
    const candidate = readCandidatePolicy(raw) as PoseCandidate;
    expect(canRelease(candidate)).toBe(true);
    expect(candidate.refineAllowed).toBe(false);
    expect(
      canRelease(readCandidatePolicy({ ...raw, sourceBvhSha256: undefined }) as PoseCandidate),
    ).toBe(false);
    expect(
      canRelease(readCandidatePolicy({ ...raw, releaseAllowed: false }) as PoseCandidate),
    ).toBe(false);
  });
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

it.each(["library", "semantic"] as const)(
  "manual %s export requires exact asset permission without changing automatic validation",
  (source) => {
    const raw = {
      source,
      manualExportAllowed: true,
      lookupAllowed: true,
      releaseAllowed: false,
      refineAllowed: true,
      sourceBvhSha256: "b".repeat(64),
      bvhAvailable: true,
    };
    const candidate = { ...readCandidatePolicy(raw), bvhAvailable: true } as PoseCandidate;
    expect(canRelease(candidate)).toBe(true);
    expect(reviewOnly(candidate)).toBe(true);
    expect(candidate).toMatchObject({
      releaseAllowed: false,
      refineAllowed: false,
      reviewRequired: true,
      actualMeshValidated: false,
    });
    for (const patch of [
      { lookupAllowed: false },
      { manualExportAllowed: false },
      { sourceBvhSha256: "bad" },
      { bvhAvailable: false },
    ]) {
      const changed = { ...raw, ...patch };
      expect(
        canRelease({
          ...readCandidatePolicy(changed),
          bvhAvailable: changed.bvhAvailable,
        } as PoseCandidate),
      ).toBe(false);
    }
    expect(canRelease({ ...raw, source: "dynamic" } as PoseCandidate)).toBe(false);
  },
);
