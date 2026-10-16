import { beforeAll, describe, expect, it } from "vitest";
import male from "./__fixtures__/mini-0.6.7.json";
import male0610 from "./__fixtures__/mini-0.6.10.json";
import female from "./__fixtures__/mini-female-0.2.2.json";
import male071 from "./__fixtures__/mini-0.7.1.json";
import female033 from "./__fixtures__/mini-female-0.3.3.json";
import { parseShapeRuntime, type ShapeRuntime } from "./format";
import { evaluateShape, resolveControls } from "./evaluate";

/**
 * 고정 자료: 실제 자산을 일부 정점으로 줄인 .ssr과, 같은 정점에서 Blender 컨트롤러
 * (standin_body.compute, fold_guard 제외)가 낸 좌표. 0.6.7·여성은 정점마다 독립이라 부분 자산도
 * 전체와 같은 값을 낸다. 0.6.10 근육 볼륨은 메시 위에서 6회 평활하므로, 검사 정점(`check`)과
 * 그 6고리 이웃을 함께 담고 검사 정점만 비교한다. 남성 0.7.1·여성 0.3.3(해부 층)은 평활·fold_guard가
 * 더 넓게 퍼져 검사 정점 5개와 10고리 이웃을 담고, fold_guard가 움직이지 않은 케이스와 근육 2 이하만
 * 넣는다(이 둘은 fold_guard 포함 컨트롤러 출력과 비교). 전체 메시 대조는 evaluate.full.test.ts.
 * 만든 방법: scripts/shape-runtime/README.md.
 */
type Fixture = {
  ssr?: string;
  ssrGzip?: string;
  check?: number[];
  cases: Record<string, { controls: Record<string, number>; positions: number[] }>;
};
async function bytesOf(fixture: Fixture) {
  const raw = Uint8Array.from(atob(fixture.ssr ?? fixture.ssrGzip!), (c) => c.charCodeAt(0));
  if (!fixture.ssrGzip) return raw;
  const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function runtime(fixture: Fixture): Promise<ShapeRuntime> {
  const parsed = parseShapeRuntime((await bytesOf(fixture)).slice().buffer);
  if (parsed.kind !== "rules") throw new Error("expected a v1 runtime");
  return parsed;
}

describe.each([
  ["남성 0.6.7", male as Fixture, "standin-body-0.6.7"],
  ["남성 0.6.10", male0610 as Fixture, "standin-body-0.6.10"],
  ["여성 0.2.2", female as Fixture, "standin-female-body-0.2.2"],
  ["남성 0.7.1", male071 as Fixture, "standin-body-0.7.1"],
  ["여성 0.3.3", female033 as Fixture, "standin-female-body-0.3.3"],
])("evaluateShape %s", (_, fixture, rules) => {
  let rt: ShapeRuntime;
  beforeAll(async () => {
    rt = await runtime(fixture);
  });

  it("declares its controller rules", () => expect(rt.header.rules).toBe(rules));

  it.each(Object.entries(fixture.cases))("%s matches Blender within 0.05 mm", (_, item) => {
    const c = resolveControls(rt, undefined, item.controls);
    const out = evaluateShape(rt, c);
    const at = fixture.check ?? Array.from({ length: out.length / 3 }, (_, i) => i);
    let worst = 0;
    at.forEach((v, j) => {
      for (let k = 0; k < 3; k++)
        worst = Math.max(worst, Math.abs(out[v * 3 + k]! - item.positions[j * 3 + k]!));
    });
    expect(worst * 1000).toBeLessThan(0.05);
  });
});

describe("근육 볼륨 (남성 0.6.10)", () => {
  let rt: ShapeRuntime;
  beforeAll(async () => {
    rt = await runtime(male0610 as Fixture);
  });

  it("ships the BULK preset and the muscle volume control", () => {
    expect(rt.header.controls.muscle_bulk).toMatchObject({ min: 0, max: 1, default: 0 });
    expect(rt.header.presets.BULK!.muscle_bulk).toBe(1);
  });

  it("changes the body only when muscle volume is above zero", () => {
    const base = evaluateShape(rt, resolveControls(rt, "MUSCLE_MAX", null));
    const same = evaluateShape(rt, resolveControls(rt, "MUSCLE_MAX", { muscle_bulk: 0 }));
    const bulk = evaluateShape(rt, resolveControls(rt, "BULK", null));
    expect(same).toEqual(base);
    expect(bulk).not.toEqual(base);
  });
});

describe("resolveControls / parse (남성 0.6.7)", () => {
  const fixture = male as Fixture;
  let rt: ShapeRuntime;
  beforeAll(async () => {
    rt = await runtime(fixture);
  });

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
    const bytes = Uint8Array.from(atob(fixture.ssr!), (c) => c.charCodeAt(0));
    bytes[0] = 0;
    expect(() => parseShapeRuntime(bytes.buffer)).toThrow(/magic/);
    const cut = Uint8Array.from(atob(fixture.ssr!), (c) => c.charCodeAt(0)).slice(0, 4000);
    expect(() => parseShapeRuntime(cut.buffer)).toThrow();
  });
});

describe("해부 층 (남성 0.7.1 · 여성 0.3.3)", () => {
  it.each([
    [
      "남성 0.7.1",
      male071 as Fixture,
      ["BASE", "IDEAL83", "IDEAL70", "TOON64", "MUSCULAR", "MUSCLE_MAX", "BULK", "SOFT", "FAT_MAX"],
    ],
    [
      "여성 0.3.3",
      female033 as Fixture,
      [
        "BASE",
        "SLIM",
        "IDEAL83",
        "IDEAL70",
        "TOON64",
        "MUSCULAR",
        "MUSCLE_MAX",
        "SOFT",
        "FAT_MAX",
        "NEW_FAT",
        "NEW_MUSCULAR",
      ],
    ],
  ])("%s ships the release presets", async (_, fixture, presets) => {
    const rt = await runtime(fixture);
    expect(Object.keys(rt.header.presets)).toEqual(presets);
    expect(rt.arrays.has("VN.val") && rt.arrays.has("PM.val")).toBe(true);
  });

  it("leaves the parent body alone when no key moves (BASE)", async () => {
    const rt = await runtime(male071 as Fixture);
    const a = evaluateShape(rt, resolveControls(rt, "BASE", null));
    const b = evaluateShape(rt, resolveControls(rt, "BASE", { leg_length: 0 }));
    expect(a).toEqual(b);
  });

  it("evaluates the female high-muscle layers without breaking (NEW_MUSCULAR)", async () => {
    const rt = await runtime(female033 as Fixture);
    const out = evaluateShape(rt, resolveControls(rt, "NEW_MUSCULAR", null));
    expect(out.every(Number.isFinite)).toBe(true);
    const two = evaluateShape(rt, resolveControls(rt, "NEW_MUSCULAR", { muscle: 2 }));
    expect(out).not.toEqual(two);
  });
});
