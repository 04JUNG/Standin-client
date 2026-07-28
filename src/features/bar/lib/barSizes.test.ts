import { describe, expect, it } from "vitest";
import { APP_MIN_SIZE, APP_SIZE, BAR_SIZES, barStateForPath, windowTargetForPath } from "./barSizes";

describe("barStateForPath", () => {
  it("바 라우트를 하위 상태로 매핑한다", () => {
    expect(barStateForPath("/bar")).toBe("collapsed");
    expect(barStateForPath("/bar/actions")).toBe("actions");
    expect(barStateForPath("/bar/progress")).toBe("progress");
    expect(barStateForPath("/bar/candidates")).toBe("candidates");
    expect(barStateForPath("/bar/save")).toBe("save");
  });

  it("바 라우트가 아니면 null", () => {
    expect(barStateForPath("/app/home")).toBeNull();
    expect(barStateForPath("/auth/login")).toBeNull();
    expect(barStateForPath("/barbecue")).toBeNull();
  });
});

describe("windowTargetForPath", () => {
  it("바 라우트는 bar 모드", () => {
    expect(windowTargetForPath("/bar")).toEqual({ mode: "bar", size: BAR_SIZES.collapsed });
    expect(windowTargetForPath("/bar/candidates")).toEqual({
      mode: "bar",
      size: BAR_SIZES.candidates,
    });
  });

  it("캡처 오버레이는 overlay 모드", () => {
    expect(windowTargetForPath("/app/capture").mode).toBe("overlay");
  });

  it("그 외는 app 모드", () => {
    expect(windowTargetForPath("/app/home")).toEqual({ mode: "app", size: APP_SIZE });
    expect(windowTargetForPath("/auth/login").mode).toBe("app");
    expect(windowTargetForPath("/app/jobs/abc/save").mode).toBe("app");
  });
});

describe("바 크기 불변식", () => {
  it("모든 바 크기가 양수다", () => {
    for (const [state, size] of Object.entries(BAR_SIZES)) {
      expect(size.width, state).toBeGreaterThan(0);
      expect(size.height, state).toBeGreaterThan(0);
    }
  });

  it("모든 바 크기가 앱 최소 크기보다 작다", () => {
    // 바가 앱 최소 크기보다 크면 모드 전환의 의미가 없고, Rust가 최소 크기를
    // 먼저 풀어야 하는 이유도 사라진다.
    for (const [state, size] of Object.entries(BAR_SIZES)) {
      const smaller = size.width < APP_MIN_SIZE.width || size.height < APP_MIN_SIZE.height;
      expect(smaller, `${state}는 앱 최소 크기보다 작아야 한다`).toBe(true);
    }
  });

  it("접힌 바가 가장 작다", () => {
    const collapsedArea = BAR_SIZES.collapsed.width * BAR_SIZES.collapsed.height;
    for (const [state, size] of Object.entries(BAR_SIZES)) {
      if (state === "collapsed") continue;
      expect(size.width * size.height, state).toBeGreaterThan(collapsedArea);
    }
  });

  it("접힌 바는 클릭 가능한 최소 크기(44px) 이상이다", () => {
    // docs/04 §13 최소 44×44 터치·클릭 영역.
    expect(BAR_SIZES.collapsed.width).toBeGreaterThanOrEqual(44);
    expect(BAR_SIZES.collapsed.height).toBeGreaterThanOrEqual(44);
  });
});
