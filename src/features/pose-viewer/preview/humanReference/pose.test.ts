import { expect, it } from "vitest";
import { humanFixture, bvhFixture } from "@/test/humanReferenceFixture";
import { parseHumanTemplate } from "./template";
import { referencePose, referenceBounds } from "./pose";
it("uses source rotations on the real neutral anatomy and preserves segment lengths", () => {
  const t = humanFixture(),
    base = referencePose(t, bvhFixture()),
    raised = referencePose(t, bvhFixture(90));
  const index = (r: string) => raised.roles.indexOf(r),
    elbow = index("forearm.L"),
    upper = index("upperarm.L");
  expect(raised.positions[elbow].y - base.positions[elbow].y).toBeCloseTo(0.5);
  expect(raised.positions[elbow].distanceTo(raised.positions[upper])).toBeCloseTo(0.5);
  expect(
    raised.positions[index("forearm.R")].distanceTo(base.positions[index("forearm.R")]),
  ).toBeCloseTo(0);
  expect(referenceBounds(t, raised.matrices).isEmpty()).toBe(false);
});
it("normalizes valid closing brace/MOTION whitespace without changing pose semantics", () => {
  const t = humanFixture();
  const a = referencePose(t, bvhFixture(70)),
    b = referencePose(t, bvhFixture(70, true));
  expect(a.matrices.map((m) => m.elements)).toEqual(b.matrices.map((m) => m.elements));
});
it("preserves the authored spine lean when a Mixamo pose is stored in offsets", () => {
  const template = humanFixture();
  template.profiles.canonical.hips = "mixamorig:Hips";
  const hierarchy = bvhFixture()
    .split("MOTION")[0]
    .replace("ROOT hips", "ROOT mixamorig:Hips")
    .replace(
      /CHANNELS [^\n]+/g,
      "CHANNELS 6 Xposition Yposition Zposition Xrotation Yrotation Zrotation",
    )
    .replace(/JOINT spine1\n\{\nOFFSET [^\n]+/, "JOINT spine1\n{\nOFFSET 0.18 0.24 0");
  const values = Array(template.joints.length * 6).fill(0);
  const read = () =>
    referencePose(
      template,
      hierarchy + "MOTION\nFrames: 1\nFrame Time: 0.033333\n" + values.join(" ") + "\n",
      true,
    );
  const baked = read();
  const spine = baked.roles.indexOf("spine");
  const chest = baked.roles.indexOf("spine1");
  expect(baked.bakedOffsets).toBe(true);
  expect(baked.positions[chest].x - baked.positions[spine].x).toBeCloseTo(0.18);
  expect(baked.positions[chest].distanceTo(baked.positions[spine])).toBeCloseTo(0.3);

  // A six-channel BVH with actual joint motion keeps the existing path.
  values[6 * spine + 3] = 15;
  expect(read().bakedOffsets).toBe(false);
});
it("rejects changed body, bad geometry, wrong scope, cyclic parents and unrecognized source rigs", () => {
  const t = humanFixture();
  expect(parseHumanTemplate(t, "full")).toBe(t);
  for (const invalid of [
    { ...t, character_sha256: "a".repeat(64) },
    { ...t, scope: "head" },
    { ...t, joints: t.joints.map((j, i) => (i ? j : { ...j, parent: 0 })) },
    { ...t, meshes: [{ ...t.meshes[0], triangles: [0, 1, 500] }] },
  ])
    expect(() => parseHumanTemplate(invalid, "full")).toThrow();
  expect(() => referencePose(t, bvhFixture().replace(/hips/g, "unknown_root"))).toThrow();
  expect(() => referencePose(t, bvhFixture().replace("Frames: 1", "Frames: 10001"))).toThrow();
});
