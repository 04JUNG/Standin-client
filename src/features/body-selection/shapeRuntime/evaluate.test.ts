import { describe, expect, it } from "vitest";
import male from "./__fixtures__/mini-0.6.7.json";
import female from "./__fixtures__/mini-female-0.2.2.json";
import { parseShapeRuntime } from "./format";
import { evaluateShape, resolveControls } from "./evaluate";

/**
 * 고정 자료: 실제 0.6.7 자산을 정점 222개로 줄인 .ssr과, 같은 정점에서 Blender 컨트롤러
 * (standin_body.compute, fold_guard 제외)가 낸 좌표. 계산은 정점마다 독립이라 부분 자산도
 * 전체와 같은 값을 낸다. 만든 방법: scripts/shape-runtime/README.md.
 */
type Fixture = {
  ssr: string;
  cases: Record<string, { controls: Record<string, number>; positions: number[] }>;
};
function runtime(fixture: Fixture) {
  const bytes = Uint8Array.from(atob(fixture.ssr), (c) => c.charCodeAt(0));
  return parseShapeRuntime(bytes.buffer);
}

describe.each([
  ["남성 0.6.7", male as Fixture, "standin-body-0.6.7"],
  ["여성 0.2.2", female as Fixture, "standin-female-body-0.2.2"],
])("evaluateShape %s", (_, fixture, rules) => {
  const rt = runtime(fixture);

  it("declares its controller rules", () => expect(rt.header.rules).toBe(rules));

  it.each(Object.entries(fixture.cases))("%s matches Blender within 0.05 mm", (_, item) => {
    const c = resolveControls(rt, undefined, item.controls);
    const out = evaluateShape(rt, c);
    let worst = 0;
    for (let i = 0; i < out.length; i++)
      worst = Math.max(worst, Math.abs(out[i]! - item.positions[i]!));
    expect(worst * 1000).toBeLessThan(0.05);
  });
});

describe("resolveControls / parse (남성 0.6.7)", () => {
  const fixture = male as Fixture;
  const rt = runtime(fixture);

  it("maps app keys and presets onto controller keys", () => {
    const c = resolveControls(rt, "IDEAL83", { height: 185, unknown_key: 3 });
    expect(c.height_cm).toBe(185);
    expect(c.heads).toBe(8.3);
    expect(c.unknown_key).toBeUndefined();
  });

  it("clamps out-of-range values instead of extrapolating", () => {
    const c = resolveControls(rt, undefined, { physique: 9, height: 10 });
    expect(c.physique).toBe(rt.header.controls.physique!.max);
    expect(c.height_cm).toBe(rt.header.controls.height_cm!.min);
  });

  it("rejects a damaged asset", () => {
    const bytes = Uint8Array.from(atob(fixture.ssr), (c) => c.charCodeAt(0));
    bytes[0] = 0;
    expect(() => parseShapeRuntime(bytes.buffer)).toThrow(/magic/);
    const cut = Uint8Array.from(atob(fixture.ssr), (c) => c.charCodeAt(0)).slice(0, 4000);
    expect(() => parseShapeRuntime(cut.buffer)).toThrow();
  });
});
