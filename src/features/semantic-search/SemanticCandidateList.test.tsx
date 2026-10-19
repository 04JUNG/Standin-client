import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SemanticCandidateList } from "./SemanticCandidateList";
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: 10000,
    bottom: 10020,
    left: 0,
    right: 1,
    width: 1,
    height: 20,
    x: 0,
    y: 10000,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("scrolling appends through the last candidate without removing earlier cards or requesting pages", () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  const rows = Array.from({ length: 47 }, (_, i) => i + 1);
  render(
    <SemanticCandidateList
      rows={rows}
      label="검색 후보"
      gridClass="grid"
      render={(i) => (
        <div key={i} data-testid="card">
          포즈 {i}
        </div>
      )}
    />,
  );
  expect(screen.getAllByTestId("card")).toHaveLength(20);
  const intersect = () =>
    act(() =>
      callbacks.at(-1)!(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
  intersect();
  expect(screen.getAllByTestId("card")).toHaveLength(40);
  expect(screen.getByText("포즈 1")).toBeInTheDocument();
  intersect();
  expect(screen.getAllByTestId("card")).toHaveLength(47);
  expect(screen.queryByRole("button")).toBeNull();
});
it("the accessible fallback also reaches the last result without IntersectionObserver", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  render(
    <SemanticCandidateList
      rows={Array.from({ length: 21 }, (_, i) => i)}
      label="근접 참고"
      gridClass="grid"
      render={(i) => <span key={i}>포즈 {i}</span>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "근접 참고 20개 더 보기" }));
  expect(screen.getByText("포즈 20")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

it("a fast scroll past the sentinel still fills every skipped batch", () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <SemanticCandidateList
      rows={Array.from({ length: 65 }, (_, i) => i)}
      label="검색 후보"
      gridClass="grid"
      render={(i) => (
        <span key={i} data-testid="card">
          {i}
        </span>
      )}
    />,
  );
  expect(screen.getAllByTestId("card")).toHaveLength(20);
  vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({
    top: -500,
    bottom: -499,
    left: 0,
    right: 1,
    width: 1,
    height: 1,
    x: 0,
    y: -500,
    toJSON: () => ({}),
  });
  fireEvent.scroll(window);
  expect(screen.getAllByTestId("card")).toHaveLength(65);
});
