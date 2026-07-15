import { describe, it, expect } from "vitest";
import { scaleSelectionToFrame } from "./cropFrame";

describe("scaleSelectionToFrame", () => {
  it("오버레이와 프레임 크기가 같으면 1:1", () => {
    const rect = scaleSelectionToFrame(
      { x: 10, y: 20, w: 100, h: 50 },
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
    );
    expect(rect).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("프레임이 더 크면 선택 좌표를 비율로 확대", () => {
    // 오버레이 640x400에서 그린 선택을 1280x800 프레임으로 매핑(2배)
    const rect = scaleSelectionToFrame(
      { x: 50, y: 25, w: 200, h: 100 },
      { width: 640, height: 400 },
      { width: 1280, height: 800 },
    );
    expect(rect).toEqual({ x: 100, y: 50, width: 400, height: 200 });
  });

  it("프레임이 더 작으면 축소", () => {
    const rect = scaleSelectionToFrame(
      { x: 100, y: 100, w: 400, h: 200 },
      { width: 1000, height: 500 },
      { width: 500, height: 250 },
    );
    expect(rect).toEqual({ x: 50, y: 50, width: 200, height: 100 });
  });
});
