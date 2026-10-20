import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarActionsPage } from "../pages/BarActionsPage";
import { BarShell } from "./BarShell";

const control = vi.hoisted(() => vi.fn(async () => {}));
const startDragging = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../api/windowMode.service", () => ({ windowModeService: { control, startDragging } }));
vi.mock("@/shared/components/GlobalShortcutAlert", () => ({ GlobalShortcutIndicator: () => null }));
vi.mock("@/features/capture/lib/startCaptureFlow", () => ({ startCaptureFlow: vi.fn() }));
vi.mock("@/shared/hooks/useShortcuts", () => ({ useShortcuts: () => {} }));

function Surface() {
  const location = useLocation();
  return (
    <>
      {location.pathname === "/bar/actions" ? (
        <BarActionsPage />
      ) : (
        <BarShell title="작업">
          <p>내용</p>
        </BarShell>
      )}
      <output>{location.pathname}</output>
    </>
  );
}
function mount(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter
        initialEntries={[
          "/auth/login",
          "/app/jobs/old",
          { pathname: path, state: { resumeJobId: "current" } },
        ]}
      >
        <Surface />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  usePoseSelectionStore.setState({ jobId: "current" });
  control.mockClear();
  startDragging.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
it("has collapse, app expansion and close in that order; no header history controls", () => {
  mount("/bar/review");
  expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
    "접기 (Esc)",
    "앱 창으로 열기",
    "닫기",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "앱 창으로 열기" }));
  expect(screen.getByRole("status")).toHaveTextContent("/app/jobs/current/review");
});
it("closes the native window without collapsing or navigating away from the job", () => {
  mount("/bar/review");
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(control).toHaveBeenCalledOnce();
  expect(control).toHaveBeenCalledWith("close");
  expect(screen.getByRole("status")).toHaveTextContent("/bar/review");
});
it("still collapses to the logo", () => {
  mount("/bar/review");
  fireEvent.click(screen.getByRole("button", { name: "접기 (Esc)" }));
  expect(screen.getByRole("status")).toHaveTextContent(/^\/bar$/);
  expect(control).not.toHaveBeenCalled();
});

it.each(["/bar/candidates", "/bar/review"])(
  "limits manual scroll anchoring to candidates: %s",
  (path) => {
    mount(path);
    const scroller = screen.getByText("내용").closest("[data-bar-scroll]")!;
    expect(scroller).toHaveClass("overflow-auto");
    expect(scroller.classList.contains("[overflow-anchor:none]")).toBe(path === "/bar/candidates");
  },
);
it("restores the main body even when an old resume marker is present", () => {
  mount("/bar/actions");
  expect(screen.queryByRole("button", { name: "현재 작업 이어보기" })).toBeNull();
  expect(screen.queryByRole("button", { name: "뒤로가기" })).toBeNull();
  expect(screen.getByRole("button", { name: /화면 캡처/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /파일 업로드/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "문장으로 찾기" })).toBeInTheDocument();
});

it("starts native dragging on grip or title mousedown but never on controls or a context click", () => {
  mount("/bar/review");
  const handle = screen.getByTitle("드래그해서 옮기기");
  fireEvent.mouseDown(handle.querySelector("svg")!, { button: 0 });
  fireEvent.mouseDown(screen.getByText("작업"), { button: 0 });
  expect(startDragging).toHaveBeenCalledTimes(2);
  fireEvent.mouseDown(handle, { button: 2 });
  fireEvent.mouseDown(handle, { button: 0, ctrlKey: true });
  fireEvent.mouseDown(screen.getByRole("button", { name: "닫기" }), { button: 0 });
  expect(startDragging).toHaveBeenCalledTimes(2);
});
