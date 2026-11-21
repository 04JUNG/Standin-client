import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/mini-sampled.json";
import { parseShapeRuntime, type AnyShapeRuntime, type SampledRuntime } from "./format";
import { evaluateShape, resolveControls } from "./evaluate";
import { modelWeights, sampledCoefficients } from "./sampled";
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
async function load(
  selectionMode?: string,
  mutate?: (header: SampledRuntime["header"]) => void,
): Promise<SampledRuntime> {
  const raw = Uint8Array.from(atob((fixture as Fixture).ssrGzip), (c) => c.charCodeAt(0));
  const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("gzip"));
  let buffer = await new Response(stream).arrayBuffer();
  if (selectionMode) {
    const size = new DataView(buffer).getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, size)));
    header.selection.mode = selectionMode;
    mutate?.(header);
    const json = new TextEncoder().encode(JSON.stringify(header));
    const padded = Math.ceil(json.length / 4) * 4;
    const rewritten = new Uint8Array(8 + padded + buffer.byteLength - 8 - size);
    rewritten.set(new Uint8Array(buffer, 0, 4));
    new DataView(rewritten.buffer).setUint32(4, padded, true);
    rewritten.fill(32, 8, 8 + padded);
    rewritten.set(json, 8);
    rewritten.set(new Uint8Array(buffer, 8 + size), 8 + padded);
    buffer = rewritten.buffer;
  }
  const parsed = parseShapeRuntime(buffer);
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

  it("parses the opt-in varying mode and rejects unknown selection semantics", async () => {
    expect((await load("idw2-varying")).header.selection?.mode).toBe("idw2-varying");
    await expect(load("unknown")).rejects.toThrow();
  });

  it("evaluates a known three-control polynomial at corners, inside and outside its grid", async () => {
    const runtime = await load("idw2-varying-trilinear");
    const preset = Object.keys(runtime.header.models)[0]!;
    runtime.header.basisCount = 1;
    const polynomial = (x: number, y: number, z: number) =>
      1 + 2 * x + 3 * y + 4 * z + 5 * x * y * z;
    const rows = [0];
    for (const x of [0, 1])
      for (const y of [0, 1]) for (const z of [0, 1]) rows.push(polynomial(x, y, z));
    runtime.coef = new Float32Array(rows);
    runtime.header.models[preset] = {
      base: 0,
      axes: [],
      pairs: [],
      triples: [{ a: "x", b: "y", c: "z", ga: [0, 1], gb: [0, 1], gc: [0, 1], offset: 1 }],
    };
    for (const [x, y, z] of [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0.2, 0.4, 0.7],
      [-1, 0.4, 2],
    ]) {
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      expect(sampledCoefficients(runtime, preset, { x: x!, y: y!, z: z! })[0]).toBeCloseTo(
        polynomial(clamp(x!), clamp(y!), clamp(z!)),
        12,
      );
    }
  });

  it("rejects undeclared, invalid and out-of-bounds three-control tables", async () => {
    const add = (header: SampledRuntime["header"]) => {
      const keys = Object.keys(header.controls),
        model = Object.values(header.models)[0]!;
      model.triples = [
        { a: keys[0]!, b: keys[1]!, c: keys[2]!, ga: [0, 1], gb: [0, 1], gc: [0, 1], offset: 0 },
      ];
    };
    await expect(load("idw2", add)).rejects.toThrow(/explicit trilinear/);
    await expect(
      load("idw2-varying-trilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.triples![0]!.c = "unknown";
      }),
    ).rejects.toThrow(/three-control grid/);
    await expect(
      load("idw2-varying-trilinear", (h) => {
        add(h);
        const t = Object.values(h.models)[0]!.triples![0]!;
        t.c = t.a;
      }),
    ).rejects.toThrow(/three-control grid/);
    await expect(
      load("idw2-varying-trilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.triples![0]!.gc = [1, 0];
      }),
    ).rejects.toThrow(/three-control grid/);
    await expect(
      load("idw2-varying-trilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.triples![0]!.offset = h.coefCount;
      }),
    ).rejects.toThrow(/coef offset/);
    expect((await load("idw2-varying-trilinear", add)).header.selection?.mode).toBe(
      "idw2-varying-trilinear",
    );
  });

  it("interpolates an independent four-control polynomial at corners and inside the grid", async () => {
    const runtime = await load("idw2-varying-multilinear");
    const preset = Object.keys(runtime.header.models)[0]!;
    const polynomial = (x: number, y: number, z: number, w: number) =>
      1 + 2 * x + 3 * y + 4 * z + 5 * w + 6 * x * z + 7 * y * z * w + 11 * x * y * z * w;
    const corners: number[][] = [];
    for (const x of [0, 1])
      for (const y of [0, 1])
        for (const z of [0, 1]) for (const w of [0, 1]) corners.push([x, y, z, w]);
    runtime.header.basisCount = 1;
    runtime.coef = new Float32Array([
      0,
      ...corners.map((v) => polynomial(v[0]!, v[1]!, v[2]!, v[3]!)),
    ]);
    runtime.header.models[preset] = {
      base: 0,
      axes: [],
      pairs: [],
      quads: [
        {
          a: "x",
          b: "y",
          c: "z",
          d: "w",
          ga: [0, 1],
          gb: [0, 1],
          gc: [0, 1],
          gd: [0, 1],
          offset: 1,
        },
      ],
    };
    for (const [x, y, z, w] of [...corners, [0.2, 0.4, 0.7, 0.3], [-1, 0.4, 2, 0.2]]) {
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      expect(sampledCoefficients(runtime, preset, { x: x!, y: y!, z: z!, w: w! })[0]).toBeCloseTo(
        polynomial(clamp(x!), clamp(y!), clamp(z!), clamp(w!)),
        12,
      );
    }
  });

  it("rejects undeclared, prototype, duplicate and out-of-bounds four-control grids", async () => {
    const add = (header: SampledRuntime["header"]) => {
      const keys = Object.keys(header.controls);
      Object.values(header.models)[0]!.quads = [
        {
          a: keys[0]!,
          b: keys[1]!,
          c: keys[2]!,
          d: keys[3]!,
          ga: [0, 1],
          gb: [0, 1],
          gc: [0, 1],
          gd: [0, 1],
          offset: 0,
        },
      ];
    };
    await expect(load("idw2-varying-trilinear", add)).rejects.toThrow(/explicit multilinear/);
    for (const key of ["unknown", "constructor"]) {
      await expect(
        load("idw2-varying-multilinear", (h) => {
          add(h);
          Object.values(h.models)[0]!.quads![0]!.d = key;
        }),
      ).rejects.toThrow(/four-control grid/);
    }
    await expect(
      load("idw2-varying-multilinear", (h) => {
        add(h);
        const q = Object.values(h.models)[0]!.quads![0]!;
        q.d = q.a;
      }),
    ).rejects.toThrow(/four-control grid/);
    await expect(
      load("idw2-varying-multilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.quads![0]!.gd = [1, 0];
      }),
    ).rejects.toThrow(/four-control grid/);
    await expect(
      load("idw2-varying-multilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.quads![0]!.offset = h.coefCount;
      }),
    ).rejects.toThrow(/coef offset/);
    await expect(
      load("idw2-varying-multilinear", (h) => {
        add(h);
        Object.values(h.models)[0]!.quads![0]!.gd = Array.from({ length: 17 }, (_, i) => i);
      }),
    ).rejects.toThrow();
    expect((await load("idw2-varying-multilinear", add)).header.selection?.mode).toBe(
      "idw2-varying-multilinear",
    );
  });

  it("keeps common controls in geometry without letting them dilute preset selection", async () => {
    const varying = await load("idw2-varying");
    const [first, second] = Object.keys(varying.header.presets) as [string, string];
    const a = varying.header.presets[first]!;
    const b = varying.header.presets[second]!;
    const near = Object.fromEntries(
      Object.keys(a).map((key) => [key, a[key]! + 0.25 * (b[key]! - a[key]!)]),
    );
    const detail = { ...near };
    for (const [key, bounds] of Object.entries(varying.header.controls)) {
      if (a[key] !== b[key]) continue;
      detail[key] =
        Math.abs(bounds.max - a[key]!) > Math.abs(bounds.min - a[key]!) ? bounds.max : bounds.min;
    }
    expect(modelWeights(varying, first, near)).toEqual(modelWeights(varying, first, detail));
    expect(modelWeights(rt, first, near)).not.toEqual(modelWeights(rt, first, detail));
    const before = evaluateShape(varying, near, undefined, first);
    const after = evaluateShape(varying, detail, undefined, first);
    expect(after.some((value, index) => Math.abs(value - before[index]!) > 1e-6)).toBe(true);
    expect(Object.keys(varying.header.controls)).toEqual(Object.keys(rt.header.controls));
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
