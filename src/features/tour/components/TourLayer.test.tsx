import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useTourStore } from "@/shared/stores/tourStore";
import { tourAnchor } from "@/shared/lib/tourAnchor";
import { TourLayer } from "./TourLayer";

/**
 * 투어가 첫 실행에만 저절로 뜨고, 사용자가 그만두면 다시 뜨지 않는지 고정한다.
 * 스텝 판정 자체는 resolveActiveStep.test.ts가 순수 함수로 덮는다.
 */

function renderTour(pathname = "/app/home", extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      {extra}
      <TourLayer />
    </MemoryRouter>,
  );
}

// jsdom에는 레이아웃이 없어 scrollIntoView가 구현돼 있지 않다.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  useTourStore.setState({
    active: false,
    acknowledged: [],
    completedAt: null,
    dismissedAt: null,
  });
  useInstallationStore.setState({ status: "registered" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TourLayer", () => {
  it("첫 실행 홈에서 저절로 시작한다", async () => {
    renderTour();
    expect(await screen.findByRole("dialog", { name: "앱 사용법 튜토리얼" })).toBeInTheDocument();
    expect(screen.getByText("Standin 사용법을 함께 볼까요?")).toBeInTheDocument();
  });

  it("동의 등록 전에는 시작하지 않는다", () => {
    useInstallationStore.setState({ status: "consent_required" });
    renderTour();
    expect(screen.queryByRole("dialog", { name: "앱 사용법 튜토리얼" })).not.toBeInTheDocument();
  });

  it("한 번 그만둔 뒤에는 저절로 뜨지 않는다", () => {
    useTourStore.setState({ dismissedAt: new Date().toISOString() });
    renderTour();
    expect(screen.queryByRole("dialog", { name: "앱 사용법 튜토리얼" })).not.toBeInTheDocument();
  });

  it("홈이 아닌 화면에서는 저절로 시작하지 않는다", () => {
    renderTour("/app/settings");
    expect(screen.queryByRole("dialog", { name: "앱 사용법 튜토리얼" })).not.toBeInTheDocument();
  });

  it("'다음'을 누르면 다음 설명으로 넘어간다", async () => {
    const user = userEvent.setup();
    renderTour();
    await screen.findByText("Standin 사용법을 함께 볼까요?");
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByText("여기서 화면을 옮깁니다")).toBeInTheDocument();
  });

  it("그만두면 사라지고 그만둔 시각이 남는다", async () => {
    const user = userEvent.setup();
    renderTour();
    await screen.findByRole("dialog", { name: "앱 사용법 튜토리얼" });
    await user.click(screen.getByRole("button", { name: "튜토리얼 그만두기" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "앱 사용법 튜토리얼" })).not.toBeInTheDocument();
    });
    expect(useTourStore.getState().dismissedAt).not.toBeNull();
    expect(useTourStore.getState().active).toBe(false);
  });

  /** 요소마다 다른 rect를 주기 위한 목. jsdom에는 레이아웃이 없다. */
  function mockRects() {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
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

  const dims = (doc: Document) =>
    Array.from(doc.querySelectorAll("div")).filter((el) =>
      el.className.includes("bg-brand-ink/50"),
    );
  const ring = (doc: Document) =>
    Array.from(doc.querySelectorAll("div")).find((el) => el.className.includes("ring-brand-sky"));

  it("강조할 요소가 있으면 그 둘레만 남기고 네 장으로 덮는다", async () => {
    mockRects();
    useTourStore.setState({ active: true, acknowledged: ["welcome"] });
    const { container } = renderTour(
      "/app/home",
      <aside {...tourAnchor("shell.sidebar")} data-rect="100,200,300,50">
        바
      </aside>,
    );

    await screen.findByText("여기서 화면을 옮깁니다");
    const doc = container.ownerDocument;
    await waitFor(() => {
      // 구멍 뚫린 한 장이 아니라 네 장이어야 강조된 요소만 밝게 남는다.
      expect(dims(doc)).toHaveLength(4);
    });
    // 강조 테두리는 앵커에 8px 여백을 두른 자리에 온다.
    expect(ring(doc)?.getAttribute("style")).toContain("top: 92px");
    expect(ring(doc)?.getAttribute("style")).toContain("left: 192px");
    expect(ring(doc)?.getAttribute("style")).toContain("width: 316px");
    expect(ring(doc)?.getAttribute("style")).toContain("height: 66px");
  });

  it("딤은 입력을 가로채지 않는다", async () => {
    mockRects();
    useTourStore.setState({ active: true, acknowledged: ["welcome"] });
    const { container } = renderTour(
      "/app/home",
      <aside {...tourAnchor("shell.sidebar")} data-rect="100,200,300,50">
        바
      </aside>,
    );

    await screen.findByText("여기서 화면을 옮깁니다");
    const doc = container.ownerDocument;
    await waitFor(() => expect(dims(doc)).toHaveLength(4));
    // 딤이 클릭을 먹으면 강조되지 않은 후보를 고를 수 없고 main 스크롤도 멈춘다.
    for (const dim of dims(doc)) {
      expect(dim.className).toContain("pointer-events-none");
    }
  });

  it("같은 앵커가 여럿이면 모두 묶어 강조한다", async () => {
    // 인물이 여럿이면 후보 그리드도 인물 수만큼 나온다. 첫 그리드만 강조하면 나머지
    // 인물의 후보는 안내에서 빠진다.
    mockRects();
    useTourStore.setState({
      active: true,
      acknowledged: ["welcome", "sidebar", "upload", "capture"],
    });
    const { container } = renderTour(
      "/app/jobs/abc",
      <div>
        <div {...tourAnchor("jobs.candidates")} data-rect="100,50,400,120" />
        <div {...tourAnchor("jobs.candidates")} data-rect="300,50,400,120" />
      </div>,
    );

    await screen.findByText("가까운 포즈 후보입니다");
    const doc = container.ownerDocument;
    await waitFor(() => expect(ring(doc)).toBeDefined());
    const style = ring(doc)!.getAttribute("style")!;
    // 위 그리드 top 100부터 아래 그리드 bottom 420까지, 여백 8px씩.
    expect(style).toContain("top: 92px");
    expect(style).toContain("height: 336px");
  });

  it("스크롤 컨테이너 밖으로 나간 부분은 강조하지 않는다", async () => {
    // 스크롤로 위가 잘린 요소를 그대로 강조하면 상단 앱 바 위에 테두리가 얹힌다.
    mockRects();
    useTourStore.setState({ active: true, acknowledged: ["welcome"] });
    const { container } = renderTour(
      "/app/home",
      <div style={{ overflow: "auto" }} data-rect="200,0,1024,400">
        <aside {...tourAnchor("shell.sidebar")} data-rect="40,100,300,600">
          바
        </aside>
      </div>,
    );

    await screen.findByText("여기서 화면을 옮깁니다");
    const doc = container.ownerDocument;
    await waitFor(() => expect(ring(doc)).toBeDefined());
    const style = ring(doc)!.getAttribute("style")!;
    // 보이는 구간은 200~600. 여백을 더해도 컨테이너 위(200)보다 위로 올라가지 않는다.
    expect(style).toContain("top: 192px");
    expect(style).toContain("height: 416px");
  });

  it("안내할 스텝이 없는 화면에서는 이어보기 안내를 띄운다", async () => {
    vi.useFakeTimers();
    try {
      useTourStore.setState({ active: true, acknowledged: [] });
      renderTour("/app/settings");
      expect(screen.queryByText("튜토리얼이 아직 켜져 있습니다.")).not.toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText("튜토리얼이 아직 켜져 있습니다.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
