import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { usePersonScrollContinuity } from "./usePersonScrollContinuity";

const observers: { resize(): void }[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push({ resize: () => callback([], this as unknown as ResizeObserver) });
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function Viewer({ scope = "job-a" }: { scope?: string }) {
  const [person, setPerson] = useState(0);
  const continuity = usePersonScrollContinuity(scope, person);
  return (
    <main>
      <div
        ref={continuity.contentRef}
        data-testid="content"
        data-height={person === 0 ? 1000 : 700}
      >
        <nav ref={continuity.indexRef} aria-label="인물 목록">
          {[0, 1].map((index) => (
            <button
              key={index}
              onClick={() => {
                continuity.beforeSwitch(index);
                setPerson(index);
              }}
            >
              인물 {index + 1}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
function layout() {
  const scroller = screen.getByRole("main");
  const index = screen.getByRole("navigation", { name: "인물 목록" });
  const content = screen.getByTestId("content");
  let lateHeight = 0;
  vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 20, 800, 600),
  );
  vi.spyOn(index, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        0,
        20 + Number(content.dataset.height) + lateHeight - scroller.scrollTop,
        800,
        200,
      ),
  );
  scroller.scrollTop = 500;
  return {
    scroller,
    index,
    grow: (value: number) => {
      lateHeight = value;
    },
  };
}
it("keeps the visible index position when moving long → no-candidate → long content", () => {
  render(<Viewer />);
  const { scroller, index } = layout();
  const before = index.getBoundingClientRect().top;
  fireEvent.click(screen.getByRole("button", { name: "인물 2" }));
  expect(scroller.scrollTop).toBe(200);
  expect(index.getBoundingClientRect().top).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "인물 1" }));
  expect(scroller.scrollTop).toBe(500);
  expect(index.getBoundingClientRect().top).toBe(before);
});
it("accounts for late preview layout, then stops as soon as the user scrolls", () => {
  render(<Viewer />);
  const { scroller, index, grow } = layout();
  const before = index.getBoundingClientRect().top;
  fireEvent.click(screen.getByRole("button", { name: "인물 2" }));
  grow(120);
  act(() => observers.at(-1)!.resize());
  expect(scroller.scrollTop).toBe(320);
  expect(index.getBoundingClientRect().top).toBe(before);
  fireEvent.wheel(scroller);
  scroller.scrollTop = 150;
  grow(250);
  act(() => observers.at(-1)!.resize());
  expect(scroller.scrollTop).toBe(150);
});
it("does not carry pending scroll correction into another job", () => {
  const view = render(<Viewer />);
  const { scroller, grow } = layout();
  fireEvent.click(screen.getByRole("button", { name: "인물 2" }));
  view.rerender(<Viewer scope="job-b" />);
  scroller.scrollTop = 40;
  grow(150);
  act(() => observers.at(-1)!.resize());
  expect(scroller.scrollTop).toBe(40);
});

it("preserves the upper viewport instead of jumping to an off-screen index", () => {
  render(<Viewer />);
  const { scroller } = layout();
  scroller.scrollTop = 0;
  fireEvent.click(screen.getByRole("button", { name: "인물 2" }));
  expect(scroller.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "인물 1" }));
  expect(scroller.scrollTop).toBe(0);
});
