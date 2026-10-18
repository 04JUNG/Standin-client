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
