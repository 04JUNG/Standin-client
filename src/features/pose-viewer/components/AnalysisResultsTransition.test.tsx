import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisResultsTransition } from "./AnalysisResultsTransition";
import { PoseSearchPending } from "./PoseSearchPending";
import type { AnalysisProgress } from "../lib/loadingProgress";
import { exampleSnapshot } from "@/dev/analysis-progress-fixture";

const progress: AnalysisProgress = {
  phase: "ranking",
  enteredAt: 0,
  snapshot: exampleSnapshot("ranking"),
};
const loading = (completed: boolean, captured?: AnalysisProgress | null) => (
  <PoseSearchPending
    preview={{ previewUrl: "blob:rough", originalName: "러프" }}
    completed={completed}
    progress={captured}
  />
);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("real-result completion crossfade", () => {
  it("shows 100 only after success and mounts usable results immediately under the fade", () => {
    vi.useFakeTimers();
    const pick = vi.fn();
    const view = render(
      <AnalysisResultsTransition
        jobKey="a"
        pending
        ready={false}
        progress={progress}
        renderPending={loading}
      />,
    );
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "100");
    view.rerender(
      <AnalysisResultsTransition
        jobKey="a"
        pending={false}
        ready
        progress={{ phase: "preparing", enteredAt: 100 }}
        renderPending={loading}
      >
        <button onClick={pick}>실제 후보 선택</button>
      </AnalysisResultsTransition>,
    );
    expect(view.container.querySelector('[data-completed="true"]')).toBeInTheDocument();
    expect(view.container.querySelector(".pose-loading__percent")).toHaveTextContent("100%");
    expect(view.container.querySelectorAll("[data-candidate-id]")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "실제 후보 선택" }));
    expect(pick).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(820));
    expect(view.container.querySelector(".analysis-transition__outgoing")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["cached", "error", "other-job", "restore"])(
    "does not flash successful completion for %s",
    (mode) => {
      const view = render(
        <AnalysisResultsTransition
          jobKey="a"
          pending={mode !== "cached"}
          ready={mode === "cached"}
          enabled={mode !== "restore"}
          progress={progress}
          renderPending={loading}
        >
          <p>결과</p>
        </AnalysisResultsTransition>,
      );
      if (mode !== "cached")
        view.rerender(
          <AnalysisResultsTransition
            jobKey={mode === "other-job" ? "b" : "a"}
            pending={false}
            ready={mode !== "error"}
            enabled={mode !== "restore"}
            progress={progress}
            renderPending={loading}
          >
            <p>결과</p>
          </AnalysisResultsTransition>,
        );
      expect(
        view.container.querySelector(".analysis-transition__outgoing"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("결과")).toBeInTheDocument();
    },
  );
  it("honors reduced motion and clears a handoff timer on navigation", () => {
    vi.useFakeTimers();
    const view = render(
      <AnalysisResultsTransition
        jobKey="a"
        pending
        ready={false}
        progress={progress}
        renderPending={loading}
      />,
    );
    view.rerender(
      <AnalysisResultsTransition
        jobKey="a"
        pending={false}
        ready
        progress={progress}
        renderPending={loading}
      >
        <p>후보</p>
      </AnalysisResultsTransition>,
    );
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const reduced = render(
      <AnalysisResultsTransition
        jobKey="b"
        pending
        ready={false}
        progress={progress}
        renderPending={loading}
      />,
    );
    reduced.rerender(
      <AnalysisResultsTransition
        jobKey="b"
        pending={false}
        ready
        progress={progress}
        renderPending={loading}
      >
        <p>후보</p>
      </AnalysisResultsTransition>,
    );
    expect(
      reduced.container.querySelector(".analysis-transition__outgoing"),
    ).not.toBeInTheDocument();
    reduced.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
