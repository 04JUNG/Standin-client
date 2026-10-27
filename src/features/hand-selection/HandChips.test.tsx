import { featureAction } from "@/features/analytics/featureJourney";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { HandChips } from "./HandChips";
import type { HandsState } from "./hooks";
import { catalog, selection } from "./fixtures";
vi.mock("@/features/analytics/featureJourney", async (original) => ({
  ...(await original<typeof import("@/features/analytics/featureJourney")>()),
  featureAction: vi.fn(),
}));
vi.mock("@/features/pose-viewer/api/thumbnails", () => ({ loadThumbnail: async () => "" }));
function mount(change = vi.fn(), extra = {}) {
  vi.mocked(featureAction).mockClear();
  const state = {
    jobId: "job_hands",
    enabled: true,
    catalog,
    entries: [{ personIndex: 0, selection }],
    ready: true,
    pending: false,
    change,
    ...extra,
  } as unknown as HandsState;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HandChips state={state} personIndex={0} />
    </QueryClientProvider>,
  );
  return change;
}
describe("character-relative hand selection", () => {
  it("shows the selected preset, visibility and low confidence with a keyboard-accessible picker", () => {
    const change = mount();
    expect(featureAction).not.toHaveBeenCalled();
    const left = screen.getByRole("button", { name: /왼손 · 힘 뺀 손/ });
    expect(left).toHaveTextContent("기본 · 러프에서 안 보임");
    expect(screen.getByRole("button", { name: /오른손 · 편 손/ })).toHaveTextContent("확인 필요");
    fireEvent.click(left);
    const dialog = screen.getByRole("dialog", { name: "인물 1의 왼손 · 그림 속 인물 기준" });
    const fists = within(dialog).getAllByRole("button", { name: "주먹" });
    fireEvent.click(fists[0]!);
    expect(change).toHaveBeenCalledWith(selection, { left: "fist" });
    expect(featureAction).toHaveBeenCalledWith("hand_library", "open", "job_hands", {
      personIndex: 0,
    });
    expect(featureAction).toHaveBeenCalledWith("hand_library", "selected", "job_hands", {
      personIndex: 0,
    });
    expect(vi.mocked(featureAction).mock.calls.some((c) => c[1] === "applied")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("filters by description and has a visible empty state", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /오른손 · 편 손/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "손 모양 검색" }), {
      target: { value: "컵" },
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "편 손" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "주먹" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "없는검색어" } });
    expect(screen.getByText("해당하는 손 모양이 없습니다.")).toBeInTheDocument();
  });
  it("restores both original recommendations and prevents writes during a pending save", () => {
    const change = mount(vi.fn(), {
      entries: [{ personIndex: 0, selection: { ...selection, left: "fist", changed: ["left"] } }],
    });
    fireEvent.click(screen.getByRole("button", { name: "추천으로 되돌리기" }));
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({ left: "fist" }),
      selection.recommended,
    );
  });
  it("does not advertise a hand picker when the capability is absent", () => {
    mount(vi.fn(), { enabled: false });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
