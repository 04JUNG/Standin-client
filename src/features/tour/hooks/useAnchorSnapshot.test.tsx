import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { tourAnchor } from "@/shared/lib/tourAnchor";
import { useAnchorSnapshot } from "./useAnchorSnapshot";

/**
 * 이 훅은 강제 레이아웃(getBoundingClientRect)과 스타일 재계산(getComputedStyle)을
 * 부른다. 필요 이상으로 부르면 렌더러 스레드가 포화돼 앱 클릭이 먹지 않는다(실측).
 * "지금 강조 중인 앵커만 잰다"는 것이 이 훅의 성능 계약이다.
 */

function mockRects() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const raw = (this as HTMLElement).dataset?.rect;
    const [top, left, width, height] = raw ? raw.split(",").map(Number) : [0, 0, 0, 0];
    return {
      top,
      left,
      width,
      height,
      bottom: top + height,
      right: left + width,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAnchorSnapshot", () => {
  it("강조 중인 앵커만 위치를 재고, 나머지는 있는지만 본다", async () => {
    mockRects();
    render(
      <div>
        <div {...tourAnchor("shell.sidebar")} data-rect="10,20,100,200" />
        <div {...tourAnchor("home.capture")} data-rect="300,40,400,80" />
      </div>,
    );

    const { result } = renderHook(() => useAnchorSnapshot(true, ["shell.sidebar"]));

    await waitFor(() => expect(result.current.get("shell.sidebar")?.visible).not.toBeNull());
    expect(result.current.get("shell.sidebar")?.visible).toEqual({
      top: 10,
      left: 20,
      width: 100,
      height: 200,
    });

    // 존재는 알아야 스텝을 고를 수 있지만, 위치까지 잴 이유는 없다.
    expect(result.current.has("home.capture")).toBe(true);
    expect(result.current.get("home.capture")?.visible).toBeNull();
  });

  it("비활성 요소는 enabled=false로 알린다", async () => {
    mockRects();
    render(
      <button {...tourAnchor("jobs.confirm")} data-rect="0,0,10,10" disabled>
        이 포즈 사용하기
      </button>,
    );

    const { result } = renderHook(() => useAnchorSnapshot(true, []));
    await waitFor(() => expect(result.current.has("jobs.confirm")).toBe(true));
    expect(result.current.get("jobs.confirm")?.enabled).toBe(false);
  });

  it("투어가 꺼져 있으면 아무것도 읽지 않는다", async () => {
    mockRects();
    render(<div {...tourAnchor("shell.sidebar")} data-rect="10,20,100,200" />);

    const { result } = renderHook(() => useAnchorSnapshot(false, ["shell.sidebar"]));
    await waitFor(() => expect(result.current.size).toBe(0));
  });
});
