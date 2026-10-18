import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PosePresentationPanel } from "./PosePresentationPanel";
import type { PosePresentation } from "../api/posePresentation";
import type { PreviewCandidate } from "../api/posePresentation";
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

it("reference images do not open an enlargement or rotation dialog", () => {
  const candidate: PreviewCandidate = {
    candidate_id: "preview_" + "a".repeat(64),
    pose_id: "pose",
    source: "library",
    kind: "library_match",
    rank: 1,
    camera_kind: "viewer_default",
    rank_score: null,
    score_kind: null,
    score_is_accuracy: false,
    render_camera: {
      version: "pose-preview-camera-v1",
      projection: "orthographic",
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      yaw_degrees: 0,
      pitch_degrees: 0,
      roll_degrees: 0,
      distance_torso: null,
      basis: "right-handed-Y-up",
      rotation_order: "Rz@Rx@Ry_column_vectors",
      origin: "hip_midpoint",
      scale: "hip_to_shoulder_midpoint_length",
      screen_y: "down",
      projection_rule: "xy=(x,-y)",
      projection_matches_search: false,
      fit_to_rough_pixels: false,
      bvh_camera_rotation_applied: false,
    },
    asset: { transport: "library_bvh", bvh_sha256: "b".repeat(64), preview_bvh_url: "/v1/preview" },
    lookup_allowed: true,
    review_required: true,
    auto_apply_allowed: false,
    refine_allowed: false,
    export_allowed: false,
    release_allowed: false,
    actual_mesh_validated: false,
  };
  const client = new QueryClient();
  client.setQueryData(["pose-bvh-source", candidate.asset.preview_bvh_url], "bvh");
  client.setQueryData(
    ["pose-bvh-render", candidate.asset.preview_bvh_url, p.output_scope, candidate.render_camera],
    "data:image/png;base64,AA==",
  );
  render(
    <QueryClientProvider client={client}>
      <PosePresentationPanel presentation={{ ...p, library_candidates: [candidate] }} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByAltText("BVH 관절 기반 3D 미리보기"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /회전|3D 미리보기/ })).toBeNull();
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

it("shows one actual opposite-hand reference within five cards without granting actions", () => {
  const camera = { rotation: [[1,0,0],[0,1,0],[0,0,1]], projection_matches_search: false };
  const rows = Array.from({length:4}, (_,i) => ({ candidate_id: `original_${i}`, pose_id: `pose_${i}`, kind: "library_match", rank: i+1,
    asset: { preview_bvh_url: `/v1/original_${i}`, bvh_sha256: "a".repeat(64) }, render_camera: camera })) as PreviewCandidate[];
  const mirror = { ...rows[0]!, candidate_id: "mirror", pose_id: "real_mirror", kind: "mirror_reference", rank:1,
    asset: { preview_bvh_url: "/v1/real_mirror", bvh_sha256: "b".repeat(64) },
    mirror_comparison: { family_id:"pair", original_pose_id:"pose_0", original_candidate_id:"original_0", is_mirror:true,
      observed_side:"left", reference_side:"right", reason:"opposite_hand_reference", matches_observed_side:false } } as PreviewCandidate;
  const client = new QueryClient();
  for (const row of [...rows,mirror]) {
    client.setQueryData(["pose-bvh-source", row.asset.preview_bvh_url], "bvh");
    client.setQueryData(["pose-bvh-render", row.asset.preview_bvh_url, p.output_scope, row.render_camera], "data:image/png;base64,AA==");
  }
  const { container } = render(<QueryClientProvider client={client}><PosePresentationPanel presentation={{...p, status:"ready", search_status:"ok", generation_status:null,
    library_candidates:rows, review_candidates:[mirror], mirror_comparison:{status:"ready",reason:"opposite_hand_reference"}}}/></QueryClientProvider>);
  expect(container.querySelectorAll('[data-presentation-candidate]')).toHaveLength(5);
  expect(screen.getByText("검색 후보 1의 반대손 참고")).toBeInTheDocument();
  expect(screen.getByText(/인물의 왼손 관측 · 오른손 자세 참고/)).toBeInTheDocument();
  expect(screen.getByRole('status').textContent).toContain('전체 5개');
  expect(screen.queryByRole('button', {name:/저장|보정|적용/})).toBeNull();
});
it("missing mirror has its own notice and keeps the returned candidate count", () => {
  render(<PosePresentationPanel presentation={{...p, mirror_comparison:{status:"unavailable",reason:"bound_mirror_not_available"}}}/>);
  expect(screen.getByText(/검증된 반대손 참고 후보를 준비하지 못했습니다/)).toBeInTheDocument();
  expect(screen.getByText("검색 후보 0개")).toBeInTheDocument();
});
