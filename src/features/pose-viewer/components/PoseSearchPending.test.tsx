import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PoseSearchPending } from "./PoseSearchPending";
import { ProgressSkeleton } from "./AnalysisProgressScene";
import { POSE_LOADING_STAGES, LOADING_STAGE_LABELS } from "../lib/loadingProgress";
import { exampleSnapshot, exampleSkeleton } from "@/dev/analysis-progress-fixture";

const preview = { previewUrl: "blob:rough-a", originalName: "러프 A.png" };
afterEach(() => vi.useRealTimers());
describe("actual analysis loading", () => {
  it("puts actual cut facts outside the image and leaves no persistent keyword badge", () => {
    const snapshot = exampleSnapshot("understanding", { multi: true, unassigned: true });
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    const sceneFacts = view.container.querySelector(".pose-loading__scene-facts")!;
    expect(sceneFacts).toHaveTextContent("전신·반신");
    expect(sceneFacts).toHaveTextContent("3/4 시점");
    expect(sceneFacts).toHaveTextContent("2명");
    expect(sceneFacts.closest(".pose-loading__visual")).toBeNull();
    expect(view.container.querySelector(".pose-loading__receiver")).not.toBeInTheDocument();
    expect(
      view.container.querySelector('[data-observation-id="scene:count:2"]'),
    ).toBeInTheDocument();
    delete snapshot.scene;
    view.rerender(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelector(".pose-loading__scene-facts")).not.toBeInTheDocument();
  });
  it.each(POSE_LOADING_STAGES)("renders %s from an observed snapshot", (phase) => {
    const snapshot = exampleSnapshot(phase);
    const { container } = render(
      <PoseSearchPending preview={preview} progress={{ phase, enteredAt: Date.now(), snapshot }} />,
    );
    expect(container.querySelector(".pose-loading")).toHaveAttribute("data-stage", phase);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent(
      LOADING_STAGE_LABELS[phase],
    );
    expect(container.querySelectorAll('[data-complete="true"]')).toHaveLength(
      snapshot.completedStages.length,
    );
    expect(container.querySelector(".pose-mannequin")).not.toBeInTheDocument();
  });
  it("draws only observed major joints and preserves image aspect ratio", () => {
    const raw = exampleSnapshot("extracting", { partial: true });
    const { container } = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: raw.stage, enteredAt: 0, snapshot: raw }}
      />,
    );
    const image = screen.getByRole("img", { name: "검색 중인 러프" });
    Object.defineProperties(image, { naturalWidth: { value: 250 }, naturalHeight: { value: 315 } });
    fireEvent.load(image);
    expect(screen.getByRole("img", { name: "분석된 주요 관절" })).toHaveAttribute(
      "viewBox",
      "0 0 1000 1260",
    );
    expect(container.querySelector('[data-edge="11-13"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-joint="0"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-edge="5-7"]')).toBeInTheDocument();
  });
  it("does not invent a skeleton or tags when their payload is absent", () => {
    const snapshot = exampleSnapshot("understanding");
    snapshot.people = [];
    render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(screen.queryByRole("img", { name: "분석된 주요 관절" })).not.toBeInTheDocument();
    expect(screen.queryByText("오른팔 들기")).not.toBeInTheDocument();
  });
  it("keeps a keyword animation mounted across identical polling updates", () => {
    const snapshot = exampleSnapshot("understanding");
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    const tags = view.container.querySelector(".pose-loading__observations");
    view.rerender(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot: { ...snapshot, sequence: 99 } }}
      />,
    );
    expect(view.container.querySelector(".pose-loading__observations")).toBe(tags);
    expect(screen.getByRole("status")).toHaveTextContent("자세와 동작을 함께 비교");
  });
  it("shows newly arrived keywords during search even when polling missed understanding", () => {
    const snapshot = exampleSnapshot("searching");
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelector(".pose-loading__observations")).toHaveTextContent(
      "오른팔 들기",
    );
  });
  it("does not replay keywords when the server advances from understanding to search", () => {
    const snapshot = exampleSnapshot("understanding");
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    const tags = view.container.querySelector(".pose-loading__observations");
    const next = { ...snapshot, stage: "searching" as const, sequence: 10 };
    view.rerender(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: next.stage, enteredAt: 0, snapshot: next }}
      />,
    );
    expect(view.container.querySelector(".pose-loading__observations")).toBe(tags);
  });
  it("focuses one actual person and frames the same source bitmap with their joints", () => {
    const snapshot = exampleSnapshot("extracting", { multi: true });
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelector(".pose-loading")).toHaveAttribute(
      "data-focused-person",
      "1",
    );
    expect(screen.getByText("인물 2")).toBeInTheDocument();
    expect(view.container.querySelector("svg image")).toHaveAttribute("href", preview.previewUrl);
    expect(screen.getByRole("img", { name: "분석된 주요 관절" })).not.toHaveAttribute(
      "viewBox",
      "0 0 1000 1000",
    );
  });
  it("marks explicit refining joints and their incoming data without guessing active joints", () => {
    const snapshot = exampleSnapshot("refining", { outcome: "running" });
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelectorAll("[data-active-joint]")).toHaveLength(2);
    expect(view.container.querySelectorAll("[data-input-joint]")).toHaveLength(2);
    expect(
      [...view.container.querySelectorAll("[data-polish-joint]")].map((node) =>
        node.getAttribute("data-polish-joint"),
      ),
    ).toEqual(["8", "10"]);
    delete snapshot.people[0].refinement!.activeJoints;
    view.rerender(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot: { ...snapshot, sequence: 20 } }}
      />,
    );
    expect(view.container.querySelector("[data-active-joint]")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-input-joint]")).not.toBeInTheDocument();
  });
  it("keeps exactly the real candidate images in the moving reel", () => {
    const snapshot = exampleSnapshot("searching");
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelector('[data-streaming="true"]')).toBeInTheDocument();
    expect(view.container.querySelectorAll(".pose-loading__candidate img")).toHaveLength(5);
  });
  it("shows real provisional joints without assigning a final person number", () => {
    const snapshot = exampleSnapshot("extracting", { multi: true, unassigned: true });
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(screen.getByText("인물 분석 중")).toBeInTheDocument();
    expect(view.container.querySelector(".pose-loading")).not.toHaveAttribute(
      "data-focused-person",
    );
    expect(view.container.querySelector(".pose-loading")).toHaveAttribute(
      "data-focus-id",
      "observed-body-1",
    );
    expect(screen.getByRole("img", { name: "분석된 주요 관절" })).toBeInTheDocument();
    expect(view.container.querySelector("svg image")).toHaveAttribute("href", preview.previewUrl);
  });
  it("uses only keywords bound to that temporary observed body", () => {
    const snapshot = exampleSnapshot("understanding", { multi: true, unassigned: true });
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(view.container.querySelector(".pose-loading__observations")).toHaveTextContent(
      "오른팔 들기",
    );
    expect(screen.getByRole("status")).toHaveTextContent("자세와 동작을 함께 비교");
  });
  it("uses actual ranks and never makes intermediate candidates selectable", () => {
    const snapshot = exampleSnapshot("ranking");
    snapshot.people[0].candidates!.reverse();
    const { container } = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(
      [...container.querySelectorAll("[data-candidate-id]")].map((el) =>
        el.getAttribute("data-candidate-id"),
      ),
    ).toEqual(["example-0", "example-1", "example-2", "example-3", "example-4"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each(["unchanged", "reverted", "skipped"] as const)(
    "does not animate a made-up change for %s",
    (outcome) => {
      const snapshot = exampleSnapshot("refining", { outcome });
      const { container } = render(
        <PoseSearchPending
          preview={preview}
          progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
        />,
      );
      expect(container.querySelector("animate")).not.toBeInTheDocument();
      expect(container.querySelector(".pose-loading__polish-sheen")).not.toBeInTheDocument();
      expect(screen.queryByText("자세를 러프에 맞췄어요")).not.toBeInTheDocument();
    },
  );
  it("interpolates actual before/after coordinates only", () => {
    const snapshot = exampleSnapshot("refining");
    const { container } = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(container.querySelector("animate")).toHaveAttribute("dur", "900ms");
    expect(container.querySelector(".pose-loading__skeleton--ghost")).toBeInTheDocument();
  });
  it("respects reduced motion for skeleton fitting", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container, unmount } = render(
      <ProgressSkeleton
        skeleton={exampleSkeleton}
        before={{
          ...exampleSkeleton,
          points: exampleSkeleton.points.map((p) => (p ? [p[0] * 0.95, p[1]] : p)),
        }}
      />,
    );
    expect(container.querySelector("animate")).not.toBeInTheDocument();
    unmount();
    vi.unstubAllGlobals();
  });
  it("marks only explicit completions and shows skipped work separately", () => {
    const snapshot = exampleSnapshot("ranking");
    snapshot.completedStages = ["analyzing"];
    snapshot.skippedStages = ["refining"];
    const { container } = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: snapshot.stage, enteredAt: 0, snapshot }}
      />,
    );
    expect(container.querySelectorAll('[data-complete="true"]')).toHaveLength(1);
    expect(screen.getByTitle("러프 맞춤 · 생략")).toHaveAttribute("data-skipped", "true");
  });
  it("keeps legacy progress generic, estimated and below completion", () => {
    vi.useFakeTimers();
    const view = render(
      <PoseSearchPending
        preview={preview}
        progress={{ phase: "running", enteredAt: Date.now() }}
      />,
    );
    act(() => vi.advanceTimersByTime(600000));
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(100);
    expect(view.container.querySelector('[aria-current="step"]')).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-complete="true"]')).not.toBeInTheDocument();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not display a different draft while restoring and recovers from a broken image", () => {
    const view = render(<PoseSearchPending preview={preview} restoring />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    view.rerender(<PoseSearchPending preview={preview} />);
    fireEvent.error(screen.getByRole("img", { name: "검색 중인 러프" }));
    expect(screen.getByText("포즈 검색은 계속 진행됩니다.")).toBeInTheDocument();
    view.rerender(<PoseSearchPending preview={{ ...preview, previewUrl: "blob:rough-b" }} />);
    expect(screen.getByRole("img", { name: "검색 중인 러프" })).toHaveAttribute(
      "src",
      "blob:rough-b",
    );
  });
  it("uses the selected pose as the existing post-selection refine reference", () => {
    render(
      <PoseSearchPending
        mode="refine"
        preview={preview}
        selectionPreviewUrl="blob:selected"
        compact
      />,
    );
    expect(screen.getByRole("img", { name: "조정 중인 선택 포즈" })).toHaveAttribute(
      "src",
      "blob:selected",
    );
    expect(screen.getByRole("heading")).toHaveTextContent("러프에 맞춰 조정하고 있어요");
  });
});
