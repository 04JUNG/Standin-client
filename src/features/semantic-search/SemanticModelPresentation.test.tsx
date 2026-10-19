import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { SemanticModelPresentation } from "./SemanticModelPresentation";
import { loadSemanticModel } from "./modelPreview";
import type {
  PosePresentation,
  PreviewCandidate,
} from "@/features/pose-viewer/api/posePresentation";
vi.mock("./modelPreview", () => ({ loadSemanticModel: vi.fn() }));
vi.mock("@/features/pose-viewer/components/DefaultPoseImage", () => ({
  DefaultPoseImage: ({ candidate }: { candidate: PreviewCandidate }) => (
    <img src={"/poster/" + candidate.candidate_id} alt="기본 체형 포즈 참고" />
  ),
}));
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
  library_candidates: Array.from({ length: 20 }, (_, i) => ({
    candidate_id: "pose" + i,
    rank: i + 1,
    source: "library",
    kind: "library_match",
    asset: { preview_bvh_url: "/test/" + i },
  })),
  review_candidates: [],
  generated_candidates: [],
} as unknown as PosePresentation;
beforeEach(() => {
  vi.mocked(loadSemanticModel).mockReset();
});
it.each([false, true])(
  "all 20 candidates use 5 posters per page with zero GLB conversion (bar=%s)",
  async (compact) => {
    const qc = new QueryClient();
    const r = render(
      <QueryClientProvider client={qc}>
        <SemanticModelPresentation presentation={p} compact={compact} />
      </QueryClientProvider>,
    );
    expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5);
    for (const end of [10, 15, 20]) {
      fireEvent.click(screen.getByRole("button", { name: "검색 후보 다음 5개" }));
      expect(screen.getByText(`검색 후보 ${end - 4}–${end} / 20개`)).toBeTruthy();
      expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5);
    }
    expect(screen.getByRole("button", { name: "검색 후보 다음 5개" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "검색 후보 이전 5개" }));
    expect(screen.getByText("검색 후보 11–15 / 20개")).toBeTruthy();
    expect(loadSemanticModel).not.toHaveBeenCalled();
    r.unmount();
    qc.clear();
  },
);
it("only the explicitly enlarged pose requests a model; slow and preempted detail never erase posters", async () => {
  let reject!: (e: Error) => void;
  vi.mocked(loadSemanticModel).mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticModelPresentation presentation={p} />
    </QueryClientProvider>,
  );
  expect(loadSemanticModel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "2번 기본 남성 모델 확대" }));
  await waitFor(() => expect(loadSemanticModel).toHaveBeenCalledOnce());
  expect(vi.mocked(loadSemanticModel).mock.calls[0][0].candidate_id).toBe("pose1");
  expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5);
  await act(async () => reject(Error("PREVIEW_PREEMPTED")));
  await screen.findByText(/기본 이미지는 유지됩니다/);
  expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5);
  expect(loadSemanticModel).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
});
it("an explicitly loaded model retains rotation controls and never grants save", async () => {
  vi.mocked(loadSemanticModel).mockResolvedValue({
    data: new ArrayBuffer(0),
    scope: "full",
    characterId: "standin-master-v2",
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticModelPresentation presentation={p} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "1번 기본 남성 모델 확대" }));
  await screen.findByRole("img", { name: "기본 남성 모델 3D 미리보기" });
  expect(screen.getByRole("button", { name: "오른쪽 회전" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
});
it("short final pages retain independent near-reference posters", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticModelPresentation
        presentation={{
          ...p,
          library_candidates: p.library_candidates.slice(0, 7),
          review_candidates: [
            { ...p.library_candidates[0], candidate_id: "near", kind: "near_match" },
          ],
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "검색 후보 다음 5개" }));
  expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(3);
  expect(screen.getByText("검색 후보 6–7 / 7개")).toBeTruthy();
  expect(loadSemanticModel).not.toHaveBeenCalled();
});
