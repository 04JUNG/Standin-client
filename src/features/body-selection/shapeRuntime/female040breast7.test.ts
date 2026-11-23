import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/mini-female-0.4.0.breast7.4.json";
import { evaluateShape, resolveControls, SUPPORTED_RULES } from "./evaluate";
import { parseShapeRuntime, type ShapeRuntime } from "./format";
import { FEMALE_040_BREAST7_POSE_GUARD } from "./female040breast7";

describe("female 0.4.0 breast7.3 — actual controller breast samples", () => {
  let runtime: ShapeRuntime;
  beforeAll(async () => {
    const packed = Uint8Array.from(atob(fixture.ssrGzip), (c) => c.charCodeAt(0));
    const stream = new Response(packed).body!.pipeThrough(new DecompressionStream("gzip"));
    const parsed = parseShapeRuntime(await new Response(stream).arrayBuffer());
    if (parsed.kind !== "rules") throw new Error("expected rules runtime");
    runtime = parsed;
  });

  it("accepts the new rules and the extended slider range", () => {
    expect(SUPPORTED_RULES.has(FEMALE_040_BREAST7_POSE_GUARD)).toBe(true);
    expect(runtime.header.controls.breast_size).toMatchObject({ min: -1, max: 2, default: 0 });
    expect(resolveControls(runtime, "BASE", { breast_size: 1.5 }).breast_size).toBe(1.5);
    expect(resolveControls(runtime, "BASE", { breast_size: 3 }).breast_size).toBe(2);
  });

  it("binds the fixture to its actual immutable authoring source", () => {
    expect(runtime.header.source).toEqual(fixture.source);
    expect(runtime.header.rules).toBe(FEMALE_040_BREAST7_POSE_GUARD);
  });

  it.each(Object.entries(fixture.cases))("size %s matches actual Blender vertices", (_, item) => {
    const got = evaluateShape(runtime, resolveControls(runtime, "BASE", item.controls));
    let worst = 0;
    item.positions.forEach((truth, i) => {
      worst = Math.max(worst, Math.abs(got[i]! - truth));
    });
    // Existing runtime precision contract, in millimetres.
    expect(worst * 1000).toBeLessThan(0.05);
  });
});
