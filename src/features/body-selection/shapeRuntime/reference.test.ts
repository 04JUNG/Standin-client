import { describe, it, expect } from "vitest";
import { zlibSync } from "fflate";
import header from "./__fixtures__/female-reference-header.json";
import { parseReferenceHeader, inflateReference, decodeReferenceArrays } from "./referenceFormat";
import { roundSourceControl } from "./referenceEvaluate";
import { warp } from "./referenceFemaleV4";
import { parseShapeRuntime } from "./format";

describe("explicit reference codec bounds", () => {
  it("accepts only the pinned source and full public preset/control coverage", () => {
    expect(parseReferenceHeader(header).encoding).toBe("female-reference-v4-zlib");
    for (const change of [
      { ...header, source: { ...header.source, controllerSha256: "a".repeat(64) } },
      { ...header, referenceVertices: 105431 },
      { ...header, presets: { BASE: header.presets.BASE } },
      { ...header, controls: { ...header.controls, arbitrary: { min: 0, max: 1, default: 0 } } },
      { ...header, deltaNames: [...header.deltaNames].reverse() },
    ])
      expect(() => parseReferenceHeader(change)).toThrow();
  });
  it("rejects decompression overflow, truncation, malformed array offsets and indices before evaluation", () => {
    const h = parseReferenceHeader(header),
      small = { ...h, rawBytes: 8 };
    expect(() => inflateReference(small, zlibSync(new Uint8Array(9)))).toThrow(/inflated size/);
    expect(() => inflateReference(small, zlibSync(new Uint8Array(7)))).toThrow(/inflated length/);
    const raw = new Uint8Array(h.rawBytes),
      bad = structuredClone(h);
    bad.arrays.base.offset = 8;
    expect(() => decodeReferenceArrays(bad, raw)).toThrow(/array layout/);
    // Bounds are checked before allocating the graph, even if the header is otherwise valid.
    expect(() => parseReferenceHeader({ ...header, rawBytes: 193 * 1024 * 1024 })).toThrow();
  });
  it("rejects unknown SSR2 encodings instead of silently treating them as sampled data", () => {
    const text = new TextEncoder().encode(JSON.stringify({ encoding: "arbitrary-program" })),
      size = Math.ceil(text.length / 4) * 4,
      buffer = new ArrayBuffer(size + 8);
    new Uint8Array(buffer).set([83, 83, 82, 50]);
    new DataView(buffer).setUint32(4, size, true);
    new Uint8Array(buffer, 8).fill(32);
    new Uint8Array(buffer, 8).set(text);
    expect(() => parseShapeRuntime(buffer)).toThrow(/unsupported encoding/);
  });
});
describe("pinned controller arithmetic", () => {
  it("normalizes binary half-way and negative values like source round(value,6)", () => {
    // Expected values recorded from CPython's round, without decimal pre-rounding.
    expect(
      [
        0.0000005, 0.0000015, 0.0000025, -0.0000005, -0.0000015, -0.0000025, 1.2345665, 1.2345675,
      ].map(roundSourceControl),
    ).toEqual([0, 0.000002, 0.000003, -0, -0.000002, -0.000003, 1.234566, 1.234568]);
  });
  it("keeps the original fixed landmarks and height warp", () => {
    const h = parseReferenceHeader(header),
      c = h.presets.BASE,
      lm = h.landmarks;
    const p = warp(new Float64Array([0, lm.head_y, lm.floor, 0, lm.head_y, lm.top]), c, lm);
    expect(p[2]).toBeCloseTo(0, 12);
    expect(p[5]).toBeCloseTo(c.height_cm / 100, 12);
  });
});
