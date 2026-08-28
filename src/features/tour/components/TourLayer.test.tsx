import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("강조할 요소가 있으면 그 둘레만 남기고 네 장으로 덮는다", async () => {
    // jsdom은 레이아웃이 없어 rect가 전부 0이다. 앵커가 화면에 있는 상황을 만든다.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 200,
      width: 300,
      height: 50,
      bottom: 150,
      right: 500,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    useTourStore.setState({ active: true, acknowledged: ["welcome"] });
    const { container } = renderTour(
      "/app/home",
      <aside {...tourAnchor("shell.sidebar")}>바</aside>,
    );

    await screen.findByText("여기서 화면을 옮깁니다");

    const divs = () => Array.from(container.ownerDocument.querySelectorAll("div"));
    await waitFor(() => {
      // 구멍 뚫린 한 장이 아니라 네 장이어야 강조된 요소가 진짜 클릭 대상으로 남는다.
      expect(divs().filter((el) => el.className.includes("bg-brand-ink/50"))).toHaveLength(4);
    });

    // 강조 테두리는 앵커에 8px 여백을 두른 자리에 온다.
    const ring = divs().find((el) => el.className.includes("ring-brand-sky"));
    expect(ring?.getAttribute("style")).toContain("top: 92px");
    expect(ring?.getAttribute("style")).toContain("left: 192px");
    expect(ring?.getAttribute("style")).toContain("width: 316px");
    expect(ring?.getAttribute("style")).toContain("height: 66px");
  });
});
