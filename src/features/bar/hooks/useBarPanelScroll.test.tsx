import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { useBarPanelScroll } from "./useBarPanelScroll";

const observers: { resize(): void; disconnected: boolean }[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.entry = {
          resize: () => callback([], this as unknown as ResizeObserver),
          disconnected: false,
        };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function Person({ scope, index }: { scope: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const scroll = useBarPanelScroll(`${scope}:${index}`, expanded);
  return (
    <section ref={scroll.sectionRef} data-testid={`person-${index}`} data-expanded={expanded}>
      {[false, true].map((value) => (
        <button
          key={String(value)}
          onClick={() => {
            scroll.beforeSwitch(value);
            setExpanded(value);
          }}
        >
          {index} {value ? "body" : "pose"}
        </button>
      ))}
    </section>
  );
}
function Viewer({ scope = "job-a", shell = true }: { scope?: string; shell?: boolean }) {
  return (
    <div data-bar-scroll={shell ? "" : undefined} data-testid="scroller">
      <div data-testid="content">
        <Person scope={scope} index={0} />
        <Person scope={scope} index={1} />
      </div>
    </div>
  );
}
function layout() {
  const scroller = screen.getByTestId("scroller");
  const sections = [0, 1].map((i) => screen.getByTestId(`person-${i}`));
  let scrollTop = 0,
    firstHeight = 700,
    bodyHeight = 1300,
    viewportHeight = 400;
  const total = () => firstHeight + (sections[1].dataset.expanded === "true" ? bodyHeight : 1500);
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => Math.min(scrollTop, Math.max(0, total() - viewportHeight)),
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(v, total() - viewportHeight));
    },
  });
  vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 30, 720, viewportHeight),
  );
  sections.forEach((section, index) => {
    vi.spyOn(section, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 30 + (index === 0 ? 0 : firstHeight) - scroller.scrollTop, 720, 500),
    );
  });
  return {
    scroller,
    sections,
    firstHeight: (v: number) => {
      firstHeight = v;
    },
    bodyHeight: (v: number) => {
      bodyHeight = v;
    },
    viewportHeight: (v: number) => {
      viewportHeight = v;
    },
  };
}
function resize() {
  act(() => observers.forEach((observer) => observer.resize()));
}

it("remembers separate pose/body positions and restores them before the next paint", () => {
  render(<Viewer />);
  const { scroller } = layout();
  scroller.scrollTop = 800;
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(800);
  fireEvent.wheel(scroller);
  scroller.scrollTop = 1100;
  fireEvent.click(screen.getByText("1 pose"));
  expect(scroller.scrollTop).toBe(800);
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(1100);
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(1100);
});

it("recovers the saved position after a short loading panel clamps scroll and later grows", () => {
  render(<Viewer />);
  const { scroller, bodyHeight, viewportHeight } = layout();
  scroller.scrollTop = 1000;
  bodyHeight(100);
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(400);
  bodyHeight(1500);
  resize();
  expect(scroller.scrollTop).toBe(1000);
  viewportHeight(600);
  resize();
  expect(scroller.scrollTop).toBe(1000);
});

it("anchors to the same person when earlier sections change height and isolates person memories", () => {
  render(<Viewer />);
  const { scroller, firstHeight, sections } = layout();
  scroller.scrollTop = 800;
  const offset = sections[1].getBoundingClientRect().top;
  fireEvent.click(screen.getByText("1 body"));
  firstHeight(900);
  resize();
  expect(scroller.scrollTop).toBe(1000);
  expect(sections[1].getBoundingClientRect().top).toBe(offset);
  fireEvent.wheel(scroller);
  scroller.scrollTop = 1200;
  fireEvent.click(screen.getByText("1 pose"));
  expect(scroller.scrollTop).toBe(1000);
  fireEvent.wheel(scroller);
  scroller.scrollTop = 200;
  fireEvent.click(screen.getByText("0 body"));
  expect(scroller.scrollTop).toBe(200);
  fireEvent.wheel(scroller);
  scroller.scrollTop = 100;
  fireEvent.click(screen.getByText("0 pose"));
  expect(scroller.scrollTop).toBe(200);
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(1200);
});

it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
  "stops late corrections on user %s instead of pulling their scroll back",
  (event) => {
    render(<Viewer />);
    const { scroller, firstHeight } = layout();
    scroller.scrollTop = 800;
    fireEvent.click(screen.getByText("1 body"));
    fireEvent(scroller, new Event(event, { bubbles: true }));
    scroller.scrollTop = 500;
    firstHeight(900);
    resize();
    expect(scroller.scrollTop).toBe(500);
    expect(observers.at(-1)!.disconnected).toBe(true);
  },
);

it("does not reuse positions or pending callbacks after changing jobs or leaving the surface", () => {
  const view = render(<Viewer />);
  const { scroller, firstHeight } = layout();
  scroller.scrollTop = 800;
  fireEvent.click(screen.getByText("1 body"));
  view.rerender(<Viewer scope="job-b" />);
  scroller.scrollTop = 100;
  firstHeight(900);
  resize();
  expect(scroller.scrollTop).toBe(100);
  fireEvent.click(screen.getByText("1 pose"));
  expect(scroller.scrollTop).toBe(100);
  view.unmount();
  expect(observers.every((observer) => observer.disconnected)).toBe(true);
});

it("does not touch scrolling outside the floating shell", () => {
  render(<Viewer shell={false} />);
  const { scroller } = layout();
  scroller.scrollTop = 800;
  fireEvent.click(screen.getByText("1 body"));
  expect(scroller.scrollTop).toBe(800);
  expect(observers).toHaveLength(0);
});
