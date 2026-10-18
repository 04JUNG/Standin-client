import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { SemanticModelPresentation } from "./SemanticModelPresentation";
import { loadSemanticModel } from "./modelPreview";
import type { PosePresentation } from "@/features/pose-viewer/api/posePresentation";
vi.mock("./modelPreview", () => ({ loadSemanticModel: vi.fn() }));
vi.mock("@/features/pose-viewer/components/ReviewModelPreview", () => ({
  ReviewModelPreview: ({ label }: { label: string }) => <canvas role="img" aria-label={label} />,
}));
const p = {
  version: "semantic-pose-presentation-v1",
  person_index: 0,
  status: "ready",
  search_status: "ok",
  generation_status: "not_requested",
  output_scope: "full",
  issues: [],
  library_candidates: [
    { candidate_id: "one", kind: "library_match", rank: 1, asset: { preview_bvh_url: "/one" } },
  ],
  review_candidates: [
    { candidate_id: "near", kind: "near_match", rank: 1, asset: { preview_bvh_url: "/near" } },
  ],
  generated_candidates: [],
} as unknown as PosePresentation;
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SemanticModelPresentation presentation={p} />
    </QueryClientProvider>,
  );
}
it("shows fixed male surfaces for search and near candidates and enlarges with rotation controls", async () => {
  vi.mocked(loadSemanticModel).mockResolvedValue({
    data: new ArrayBuffer(0),
    characterId: "standin-master-v2",
    scope: "full",
  });
  show();
  await waitFor(() =>
    expect(screen.getAllByRole("img", { name: "기본 남성 모델 3D 미리보기" })).toHaveLength(2),
  );
  expect(screen.getByText("검색 후보 1개")).toBeTruthy();
  expect(screen.getByText("근접·기하·구도 참고 1개")).toBeTruthy();
  expect(screen.queryByAltText("BVH 관절 기반 3D 미리보기")).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "1번 기본 남성 모델 확대" })[0]!);
  expect(await screen.findByRole("button", { name: "오른쪽 회전" })).toBeTruthy();
  expect(screen.getByText(/자동 적용·refine·내보내기는 지원하지/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
});
it("reports a mesh failure without silently substituting a skeleton", async () => {
  vi.mocked(loadSemanticModel).mockRejectedValue(Error("offline"));
  show();
  await waitFor(() =>
    expect(screen.getAllByText("체형 모델을 불러오지 못했습니다.")).toHaveLength(2),
  );
  expect(screen.queryByAltText("BVH 관절 기반 3D 미리보기")).toBeNull();
  expect(screen.getAllByRole("button", { name: "미리보기 다시 불러오기" })).toHaveLength(2);
});

vi.mock("@/features/body-selection/presentation", () => ({
  usePresentationBody: () => ({
    entry: { ready: true },
    images: { one: "/selected-female.png", near: "/selected-female-near.png" },
  }),
}));
vi.mock("@/features/body-selection/BodyCandidates", () => ({
  BodyChip: () => <span>여성 체형 수정</span>,
  BodyExpand: () => <span>체형 수치</span>,
  BodyRenderStatus: () => null,
}));
it("uses the selected body instead of fixed male surfaces when the server enables body previews", () => {
  vi.mocked(loadSemanticModel).mockClear();
  const presentation = {
    ...p,
    library_candidates: p.library_candidates.map((c) => ({
      ...c,
      render_camera: { ...c.render_camera, projection_matches_search: false },
    })),
    review_candidates: [],
  } as PosePresentation;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticModelPresentation presentation={presentation} bodyPreviewJob="job" />
    </QueryClientProvider>,
  );
  expect(screen.getByText("여성 체형 수정")).toBeTruthy();
  expect(screen.getByAltText("선택한 체형과 수치를 적용한 포즈")).toHaveAttribute(
    "src",
    "/selected-female.png",
  );
  expect(loadSemanticModel).not.toHaveBeenCalled();
  expect(screen.queryByRole("img", { name: "기본 남성 모델 3D 미리보기" })).toBeNull();
  expect(
    screen.getByText("검수용입니다. 자동 적용·보정·내보내기를 지원하지 않습니다."),
  ).toBeTruthy();
});
