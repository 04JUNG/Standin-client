import { describe, expect, it } from "vitest";
import { skeletonFocus, movedJoints, refinementJoints } from "./loadingGeometry";
import { activeProgressPerson } from "../api/analysisProgress";
import { exampleSkeleton, exampleSnapshot } from "@/dev/analysis-progress-fixture";

describe("real-person loading geometry", () => {
  it("focuses the person with usable joints rather than an empty first slot", () => {
    const snapshot = exampleSnapshot("extracting", { multi: true });
    snapshot.activePersonIndex = 0;
    delete snapshot.people[0].skeleton;
    expect(activeProgressPerson(snapshot, "skeleton")?.personIndex).toBe(1);
    expect(activeProgressPerson(snapshot, "skeleton")?.skeleton).toBe(snapshot.people[1].skeleton);
  });
  it("honors a valid server focus and never merges two people's joints", () => {
    const snapshot = exampleSnapshot("extracting", { multi: true });
    const active = activeProgressPerson(snapshot, "skeleton")!;
    expect(active.personIndex).toBe(1);
    const focus = skeletonFocus(active.skeleton)!;
    for (const point of active.skeleton!.points.slice(5))
      if (point) {
        expect(point[0]).toBeGreaterThanOrEqual(focus.x);
        expect(point[0]).toBeLessThanOrEqual(focus.x + focus.width);
        expect(point[1]).toBeGreaterThanOrEqual(focus.y);
        expect(point[1]).toBeLessThanOrEqual(focus.y + focus.height);
      }
    expect(focus.x).toBeGreaterThan(0.35);
    expect(focus.width).toBeLessThan(0.5);
  });
  it("does not invent a focus or missing joints in sparse observations", () => {
    const sparse = {
      ...exampleSkeleton,
      points: exampleSkeleton.points.map((p, i) => (i === 5 ? p : null)),
    };
    const original = structuredClone(sparse);
    expect(skeletonFocus(sparse)).toBeUndefined();
    expect(sparse).toEqual(original);
    const two = {
      ...exampleSkeleton,
      points: exampleSkeleton.points.map((p, i) => (i === 5 || i === 6 ? p : null)),
    };
    expect(skeletonFocus(two, two)).toBeUndefined();
  });
  it("distinguishes projected point changes from explicit active optimization joints", () => {
    const before = structuredClone(exampleSkeleton);
    before.points[8] = [0.4, 0.4];
    expect(movedJoints(before, exampleSkeleton)).toEqual([8]);
    expect(refinementJoints({ candidateId: "c", status: "running", before })).toEqual([]);
    expect(
      refinementJoints({ candidateId: "c", status: "running", before, activeJoints: [8, 10] }),
    ).toEqual([8, 10]);
    expect(
      refinementJoints({ candidateId: "c", status: "improved", before, after: exampleSkeleton }),
    ).toEqual([8]);
    expect(
      refinementJoints({
        candidateId: "c",
        status: "reverted",
        before,
        after: exampleSkeleton,
        activeJoints: [8],
      }),
    ).toEqual([]);
  });
});
