import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { BarActionsPage } from "../pages/BarActionsPage";
import { BarShell } from "./BarShell";

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
      <MemoryRouter initialEntries={["/auth/login", "/app/jobs/old", path]}>
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
  usePoseSelectionStore.setState({
    jobId: "current",
    selectedByPerson: { 0: "pose-a", 1: "pose-b" },
    characterByPerson: { 1: "body-b" },
  });
  useExportStore.persist.setOptions({
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  useExportStore.setState({ jobId: "current", status: "saved", savedPaths: ["/saved/a.fbx"] });
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["/bar/search", "/bar/actions"],
  ["/bar/candidates", "/bar/actions"],
  ["/bar/review", "/bar/candidates"],
  ["/bar/save", "/bar/review"],
])("%s returns to %s without resetting work or following browser history", (from, to) => {
  const draft = {
    id: "draft",
    source: "file" as const,
    previewUrl: "data:image/png;base64,",
    originalName: "a.png",
    mimeType: "image/png",
    width: 100,
    height: 100,
    createdAt: "now",
  };
  useUploadStore.setState({ draft });
  const selection = usePoseSelectionStore.getState();
  const exports = useExportStore.getState();
  mount(from);
  const back = screen.getByRole("button", { name: "뒤로가기" });
  expect(back).toBeEnabled();
  expect(back).toHaveTextContent("");
  fireEvent.click(back);
  expect(screen.getByRole("status")).toHaveTextContent(to);
  expect(usePoseSelectionStore.getState()).toBe(selection);
  expect(useExportStore.getState()).toBe(exports);
  expect(useUploadStore.getState().draft).toBe(draft);
});
it.each(["/bar/actions", "/bar/progress", "/bar/unknown"])(
  "%s has no safe previous step",
  (path) => {
    mount(path);
    expect(screen.getByRole("button", { name: "뒤로가기" })).toBeDisabled();
  },
);
it("does not leave an in-flight save; the matching job owns the lock", () => {
  useExportStore.setState({ status: "saving" });
  mount("/bar/save");
  expect(screen.getByRole("button", { name: "뒤로가기" })).toBeDisabled();
});
it("disables job-specific back destinations when the job is absent", () => {
  usePoseSelectionStore.setState({ jobId: null });
  mount("/bar/review");
  expect(screen.getByRole("button", { name: "뒤로가기" })).toBeDisabled();
});
it("keeps collapse and expansion alongside the icon-only back button", () => {
  mount("/bar/review");
  const buttons = screen.getAllByRole("button");
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
    "뒤로가기",
    "접기 (Esc)",
    "앱 창으로 열기",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "앱 창으로 열기" }));
  expect(screen.getByRole("status")).toHaveTextContent("/app/jobs/current/review");
});

it("offers only the current job after back and resumes its candidates", () => {
  mount("/bar/candidates");
  fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
  fireEvent.click(screen.getByRole("button", { name: "현재 작업 이어보기" }));
  expect(screen.getByRole("status")).toHaveTextContent("/bar/candidates");
});
it("does not offer stale work on a fresh entry", () => {
  mount("/bar/actions");
  expect(screen.queryByRole("button", { name: "현재 작업 이어보기" })).toBeNull();
});
