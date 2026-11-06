import { describe, expect, it } from "vitest";
import { readAnalysisProgress, activeProgressPerson } from "./analysisProgress";
import { exampleSnapshot } from "@/dev/analysis-progress-fixture";
import { mergeAnalysisProgress, estimateLoadingProgress } from "../lib/loadingProgress";

describe("observed analysis progress", () => {
  it("keeps explicit cut observations without inventing defaults or a count from people", () => {
    const raw = exampleSnapshot("understanding", { multi: true, unassigned: true });
    const parsed = readAnalysisProgress({
      ...raw,
      scene: {
        shot: "bust",
        view: "side",
        personCount: 2,
        dialogue: "private",
        prompt: "private",
        approxBoxes: [1, 2],
      },
    })!;
    expect(parsed.scene).toEqual({ shot: "bust", view: "side", personCount: 2 });
    expect(parsed.people).toHaveLength(0);
    expect(readAnalysisProgress({ ...raw, scene: undefined })?.scene).toBeUndefined();
  });
  it("drops only malformed scene fields and preserves the valid progress evidence", () => {
    const raw = exampleSnapshot("extracting");
    const parsed = readAnalysisProgress({
      ...raw,
      scene: { shot: "bust", view: "unknown", personCount: -1 },
    });
    expect(parsed?.scene?.shot).toBe("bust");
    expect(parsed?.scene?.view).toBeUndefined();
    expect(parsed?.scene?.personCount).toBeUndefined();
    expect(parsed?.people).toEqual(raw.people);
  });
  it("reads the shared snapshot and strips private/unknown fields", () => {
    const raw = exampleSnapshot("understanding");
    const parsed = readAnalysisProgress({
      ...raw,
      privateTrace: "must not escape",
      people: raw.people.map((p) => ({ ...p, prompt: "private" })),
    });
    expect(parsed).toEqual(raw);
    expect(parsed).not.toHaveProperty("privateTrace");
  });
  it.each([
    { version: "future-v2" },
    { sequence: -1 },
    { sequence: NaN },
    { updatedAt: "yesterday" },
    { completedStages: ["searching"], skippedStages: ["searching"] },
    { people: [{ personIndex: 0 }, { personIndex: 0 }] },
    {
      people: [
        {
          personIndex: 0,
          skeleton: { format: "coco17", coordinateSpace: "crop-pixels", points: [] },
        },
      ],
    },
    {
      people: [
        { personIndex: 0, candidates: [{ id: "x", rank: 1, thumbnailUrl: "javascript:alert(1)" }] },
      ],
    },
    {
      people: [
        { personIndex: 0, candidates: [{ id: "x", rank: 1, thumbnailUrl: "//external/image" }] },
      ],
    },
    {
      people: [
        {
          personIndex: 0,
          observations: [
            { id: "x", label: "a" },
            { id: "x", label: "b" },
          ],
        },
      ],
    },
  ])("ignores malformed optional progress without breaking the analysis (%j)", (patch) => {
    expect(readAnalysisProgress({ ...exampleSnapshot("extracting"), ...patch })).toBeUndefined();
  });
  it("rejects out-of-image/nonfinite coordinates and unbounded content", () => {
    const raw = exampleSnapshot("extracting");
    raw.people[0].skeleton!.points[5] = [1.5, 0.3];
    expect(readAnalysisProgress(raw)).toBeUndefined();
    raw.people[0].skeleton!.points[5] = [Infinity, 0.3];
    expect(readAnalysisProgress(raw)).toBeUndefined();
  });
  it("does not borrow another person's observations when the active slot is absent", () => {
    const raw = exampleSnapshot("extracting", { multi: true });
    raw.activePersonIndex = 19;
    expect(activeProgressPerson(raw)).toBeUndefined();
  });
  it.each([[4], [17], [8, 8], [-1]].map((activeJoints) => ({ activeJoints })))(
    "rejects unsupported or duplicate active joints $activeJoints",
    ({ activeJoints }) => {
      const raw = exampleSnapshot("refining", { outcome: "running" });
      raw.people[0].refinement!.activeJoints = activeJoints;
      expect(readAnalysisProgress(raw)).toBeUndefined();
    },
  );
  it("accepts a temporary focus while stripping its private or selectable identity", () => {
    const raw = exampleSnapshot("understanding", { multi: true, unassigned: true });
    const parsed = readAnalysisProgress({
      ...raw,
      focus: { ...raw.focus, personIndex: 11, privateTrace: "secret" },
    })!;
    expect(parsed.focus?.observations).toEqual(raw.focus?.observations);
    expect(parsed.focus).not.toHaveProperty("personIndex");
    expect(parsed.focus).not.toHaveProperty("privateTrace");
    expect(parsed.people).toEqual([]);
  });
  it("keeps the newest cumulative snapshot on repeats, late packets and legacy gaps", () => {
    const first = exampleSnapshot("understanding", { sequence: 4 });
    const current = mergeAnalysisProgress(null, first.stage, first, 1000);
    expect(
      mergeAnalysisProgress(
        current,
        "extracting",
        exampleSnapshot("extracting", { sequence: 3 }),
        2000,
      ),
    ).toBe(current);
    expect(mergeAnalysisProgress(current, first.stage, first, 2000)).toBe(current);
    expect(mergeAnalysisProgress(current, "running", undefined, 2000)).toBe(current);
    const next = exampleSnapshot("understanding", { sequence: 5 });
    next.people[0].observations = [{ id: "seated", label: "앉은 자세" }];
    const updated = mergeAnalysisProgress(current, next.stage, next, 3000);
    expect(updated.enteredAt).toBe(1000);
    expect(updated.snapshot?.people[0].observations?.[0].label).toBe("앉은 자세");
    expect(mergeAnalysisProgress(updated, "preparing", undefined, 4000).snapshot).toBeUndefined();
  });
  it("keeps percent stable when real progress first arrives after generic running", () => {
    const generic = mergeAnalysisProgress(null, "running", undefined, 0);
    const late = mergeAnalysisProgress(generic, "extracting", exampleSnapshot("extracting"), 18000);
    expect(late.estimateFloor).toBeGreaterThanOrEqual(estimateLoadingProgress("running", 18000));
  });
});
