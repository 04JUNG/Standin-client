import { describe, expect, it } from "vitest";
import { cropRect } from "./roughCrop";
import { readPersonBox } from "../api/pose.http";

describe("원본 인물 상자", () => {
  it("유한하고 넓이가 있는 네 값만 받는다", () => {
    expect(readPersonBox([10, 20, 110, 220])).toEqual([10, 20, 110, 220]);
    for (const bad of [
      null,
      undefined,
      [1, 2, 3],
      [5, 5, 5, 9],
      [0, 0, Infinity, 1],
      [-1, 0, 4, 4],
      ["1", 0, 4, 4],
    ])
      expect(readPersonBox(bad)).toBeNull();
  });

  it("원본 안으로 넣고 조금 넓혀 자른다", () => {
    const rect = cropRect([100, 100, 200, 300], { width: 1000, height: 1000 })!;
    expect(rect.x).toBeLessThan(100);
    expect(rect.y).toBeLessThan(100);
    expect(rect.x + rect.width).toBeGreaterThan(200);
    expect(rect.y + rect.height).toBeGreaterThan(300);
    const edge = cropRect([0, 0, 1000, 1000], { width: 1000, height: 1000 })!;
    expect(edge).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it("원본과 좌표계가 맞지 않아 보이면 자르지 않는다", () => {
    expect(cropRect([100, 100, 2000, 300], { width: 1000, height: 1000 })).toBeNull();
    expect(cropRect(null, { width: 1000, height: 1000 })).toBeNull();
    expect(cropRect([1, 1, 2, 2], null)).toBeNull();
  });
});
