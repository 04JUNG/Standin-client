import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PosePresentationPanel } from "./PosePresentationPanel";
import type { PosePresentation } from "../api/posePresentation";
vi.mock("@/shared/api/client", () => ({ apiFetchBytes: vi.fn(() => new Promise(() => {})) }));
const p: PosePresentation = {
  version: "dynamic-pose-presentation-v1",
  person_index: 0,
  route: "hybrid",
  status: "review_ready",
  search_status: "no_result",
  search_reason: null,
  generation_status: "rejected",
  generation_reason: "skin_check",
  output_scope: "half",
  unobserved_body_is_default: true,
  library_candidates: [],
  review_candidates: [],
  generated_candidates: [],
  basic_model: null,
  issues: [],
  preview_status: "ready",
  auto_apply_allowed: false,
  refine_allowed: false,
  export_allowed: false,
};
it("keeps group counts and search/generation failure distinct", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PosePresentationPanel presentation={p} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("검색 후보 0개")).toBeTruthy();
  expect(screen.getByText("생성 검수 후보 0개")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("검증 탈락");
  expect(screen.getByRole("status").textContent).toContain("기본값");
});

it("keeps rough-search Top-5 visible without text-search pagination", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ candidate_id: `rough_${i}`, rank: i + 1 }));
  render(
    <PosePresentationPanel
      presentation={{ ...p, library_candidates: rows } as PosePresentation}
      renderCandidate={(c) => <span>러프 후보 {c.rank}</span>}
    />,
  );
  expect(screen.getAllByText(/^러프 후보 \d$/)).toHaveLength(5);
  expect(screen.queryByRole("navigation")).toBeNull();
});
