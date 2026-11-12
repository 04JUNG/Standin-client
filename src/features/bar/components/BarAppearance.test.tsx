import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import type { useAnalysisResult } from "@/features/pose-viewer/hooks/useAnalysisResult";
import { usePoseSelectionStore as store } from "@/features/pose-viewer/store/poseSelectionStore";
const panel = vi.hoisted(() => ({ open: false }));
vi.mock("@/features/body-selection/bodyPanel", () => ({ useBodyPanel: () => panel }));
vi.mock("@/features/pose-viewer/components/CandidatePreviewContext", () => ({
  CandidatePreviewProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/body-selection/BodyCandidates", () => ({
  BodyExpand: () => <div>체형 조정</div>,
  BodyChip: () => <span>체형 더보기</span>,
  BodyRenderStatus: () => null,
  BodyCandidateCard: () => <div>포즈 후보</div>,
}));
vi.mock("@/features/pose-viewer/components/PersonFallbackNotice", () => ({
  PersonFallbackNotice: () => null,
}));
vi.mock("@/features/pose-viewer/components/RoughPanel", () => ({ RoughPanel: () => null }));
vi.mock("../hooks/useBarPanelScroll", () => ({
  useBarPanelScroll: () => ({ sectionRef: { current: null }, beforeSwitch: () => {} }),
}));
import { BarPersonCandidates } from "./BarPersonCandidates";
beforeEach(() => {
  panel.open = false;
  store.getState().clearSelection();
});
afterEach(cleanup);
it("shows the compact appearance row only in body expansion and retains choices after collapse", () => {
  const person = {
    index: 0,
    candidates: [{ id: "pose", title: "포즈", rank: 1 }],
    fallbackMode: "none",
  } as PersonResult;
  const analysis = {
    data: { jobId: "job", capabilities: {} },
    bodies: { enabled: true, entries: [] },
    people: [person],
    excludedPeople: {},
    selectedByPerson: {},
    setPersonIncluded: () => {},
    selectCandidate: () => {},
  } as unknown as ReturnType<typeof useAnalysisResult>;
  const node = () => (
    <BarPersonCandidates person={person} analysis={analysis} onPickPerson={() => {}} />
  );
  const view = render(node());
  expect(screen.queryByRole("group", { name: "인물 1 스킨" })).not.toBeInTheDocument();
  panel.open = true;
  view.rerender(node());
  fireEvent.click(screen.getByRole("button", { name: "살색" }));
  fireEvent.click(screen.getByRole("button", { name: "근육선" }));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
  expect(store.getState().skinByPerson[0]).toBe("flesh-muscle");
  expect(store.getState().outlineByPerson[0]).toBe(2);
  panel.open = false;
  view.rerender(node());
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(store.getState().skinByPerson[0]).toBe("flesh-muscle");
  expect(store.getState().outlineByPerson[0]).toBe(2);
});
