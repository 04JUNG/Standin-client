import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/mini-sampled.json";
import { parseShapeRuntime, type AnyShapeRuntime, type SampledRuntime } from "./format";
import { evaluateShape, resolveControls } from "./evaluate";
import { modelWeights } from "./sampled";
import { matchesCatalog, supportedRuntime, type ShapeRuntimeRef } from "./load";

/**
 * 고정 자료: build_sampled_runtime.py가 만든 v2 자산을 정점 300개로 줄인 것과, 같은 정점에서
 * 빌더(Python)가 계산한 좌표. 앱 계산이 빌더가 오차를 잰 계산과 같은지 확인한다
 * (컨트롤러 대비 오차는 빌드 리포트에 남는다).
 */
type Fixture = {
  ssrGzip: string;
  cases: Record<string, { preset: string; controls: Record<string, number>; positions: number[] }>;
};
async function load(): Promise<SampledRuntime> {
  const raw = Uint8Array.from(atob((fixture as Fixture).ssrGzip), (c) => c.charCodeAt(0));
  const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("gzip"));
  const parsed = parseShapeRuntime(await new Response(stream).arrayBuffer());
  if (parsed.kind !== "sampled") throw new Error("expected v2");
  return parsed;
}

describe("standin-shape-runtime.v2 (표본)", () => {
  let rt: SampledRuntime;
  beforeAll(async () => {
    rt = await load();
  });

  it("names the controller version and authoring source", () => {
    expect(rt.header.rules).toMatch(/^standin-/);
    expect(rt.header.source.blendSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(rt.header.models).sort()).toEqual(Object.keys(rt.header.presets).sort());
  });

  it.each(Object.entries((fixture as Fixture).cases))(
    "%s evaluates exactly what the builder measured",
    (_, item) => {
      const c = resolveControls(rt, item.preset, item.controls);
      const out = evaluateShape(rt, c, undefined, item.preset);
      let worst = 0;
      for (let i = 0; i < out.length; i++)
        worst = Math.max(worst, Math.abs(out[i]! - item.positions[i]!));
      expect(worst * 1000).toBeLessThan(0.001);
    },
  );

  it("uses one model on a preset and blends nearby models away from it", () => {
    const [first, second] = Object.keys(rt.header.presets) as [string, string];
    expect(rt.header.selection?.mode).toBe("idw2");
    const exact = resolveControls(rt, first, {});
    expect(modelWeights(rt, first, exact)).toEqual([[first, 1]]);
    const a = rt.header.presets[first]!;
    const b = rt.header.presets[second]!;
    const middle = Object.fromEntries(Object.keys(a).map((k) => [k, (a[k]! + b[k]!) / 2]));
    const weights = modelWeights(rt, first, middle);
    expect(weights.map(([n]) => n).sort()).toEqual([first, second].sort());
    expect(weights.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1, 12);
  });

  it("needs the preset model to evaluate", () => {
    const c = resolveControls(rt, Object.keys(rt.header.presets)[0], {});
    expect(() => evaluateShape(rt, c)).toThrow(/preset/);
  });

  it("app keys reach controller fields through aliases and are clipped to range", () => {
    const preset = Object.keys(rt.header.presets)[0]!;
    const c = resolveControls(rt, preset, { height: 999, unknown_key: 1 });
    expect(c.height_cm).toBe(rt.header.controls.height_cm!.max);
    expect("unknown_key" in c).toBe(false);
  });
});

describe("버전 가드", () => {
  let rt: SampledRuntime;
  let ref: ShapeRuntimeRef;
  beforeAll(async () => {
    rt = await load();
    ref = {
      url: "/v1/models/x/shape-runtime/" + "a".repeat(64),
      sha256: "a".repeat(64),
      bytes: 1,
      format: "standin-shape-runtime.v2",
      rules: rt.header.rules,
      preset: Object.keys(rt.header.presets)[0]!,
      source: { rules: rt.header.rules, ...rt.header.source },
    };
  });

  it("uses a v2 runtime only when the catalog names the same source", () => {
    expect(supportedRuntime(ref)).toBe(true);
    expect(matchesCatalog(rt, ref)).toBe(true);
    expect(supportedRuntime({ ...ref, source: undefined })).toBe(false);
    for (const source of [
      { ...ref.source!, rules: "standin-body-0.0.0" },
      { ...ref.source!, blendSha256: "b".repeat(64) },
      { ...ref.source!, controllerSha256: "c".repeat(64) },
    ])
      expect(matchesCatalog(rt, { ...ref, source })).toBe(false);
    expect(matchesCatalog(rt, { ...ref, preset: "NOPE" })).toBe(false);
  });

  it("pairs a v1 runtime with a baking catalog only when its header names the same source", () => {
    const v1 = (source?: object) =>
      ({
        kind: "rules",
        header: { rules: ref.rules, presets: { [ref.preset]: {} }, source },
      }) as unknown as AnyShapeRuntime;
    const asV1 = { ...ref, format: "standin-shape-runtime.v1" as const };
    // 예전 v1 자산(원본 해시 없음)은 원본을 밝힌 카탈로그와 짝짓지 않는다.
    expect(matchesCatalog(v1(), asV1)).toBe(false);
    expect(matchesCatalog(v1(), { ...asV1, source: undefined })).toBe(true);
    // 원본 해시가 있는 v1(정밀 이식 규칙)은 같은 원본일 때만.
    expect(matchesCatalog(v1(rt.header.source), asV1)).toBe(true);
    expect(matchesCatalog(v1({ ...rt.header.source, blendSha256: "d".repeat(64) }), asV1)).toBe(
      false,
    );
    // 형식이 카탈로그와 다르면 쓰지 않는다.
    expect(matchesCatalog(v1(rt.header.source), ref)).toBe(false);
  });

  it("rejects a corrupted asset", () => {
    expect(() =>
      parseShapeRuntime(new Uint8Array([0x53, 0x53, 0x52, 0x32, 255, 255, 0, 0]).buffer),
    ).toThrow();
  });
});
