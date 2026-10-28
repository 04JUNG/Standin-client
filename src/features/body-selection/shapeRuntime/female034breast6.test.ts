import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/mini-female-0.3.4.breast6.json";
import { evaluateShape, resolveControls, SUPPORTED_RULES } from "./evaluate";
import { parseShapeRuntime, type ShapeRuntime } from "./format";
import { FEMALE_034_BREAST6 } from "./female034breast6";

describe("female breast6 — actual controller breast samples", () => {
  let runtime: ShapeRuntime;
  beforeAll(async () => {
    const packed = Uint8Array.from(atob(fixture.ssrGzip), (c) => c.charCodeAt(0));
    const stream = new Response(packed).body!.pipeThrough(new DecompressionStream("gzip"));
    const parsed = parseShapeRuntime(await new Response(stream).arrayBuffer());
    if (parsed.kind !== "rules") throw new Error("expected rules runtime");
    runtime = parsed;
  });

  it("accepts the new rules and the extended slider range", () => {
    expect(SUPPORTED_RULES.has(FEMALE_034_BREAST6)).toBe(true);
    expect(runtime.header.controls.breast_size).toMatchObject({ min: -1, max: 2, default: 0 });
    expect(resolveControls(runtime, "BASE", { breast_size: 1.5 }).breast_size).toBe(1.5);
    expect(resolveControls(runtime, "BASE", { breast_size: 3 }).breast_size).toBe(2);
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
