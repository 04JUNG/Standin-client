export interface RenderCamera {
  version: "pose-preview-camera-v1";
  projection: "orthographic" | "perspective";
  rotation: number[][];
  yaw_degrees: number;
  pitch_degrees: number;
  roll_degrees: number;
  distance_torso: number | null;
  basis: "right-handed-Y-up";
  rotation_order: "Rz@Rx@Ry_column_vectors";
  origin: "hip_midpoint";
  scale: "hip_to_shoulder_midpoint_length";
  screen_y: "down";
  projection_rule: "xy=(x,-y)" | "xy=(x,-y)/(z+distance_torso)";
  projection_matches_search: boolean;
  fit_to_rough_pixels: false;
  bvh_camera_rotation_applied: false;
}
export interface PreviewCandidate {
  candidate_id: string;
  pose_id: string | null;
  source: "library" | "generation";
  kind: string;
  mirror_comparison?: {
    family_id: string; original_pose_id: string; original_candidate_id: string; original_bvh_sha256: string;
    is_mirror: boolean; observed_side: "left" | "right"; reference_side: "left" | "right";
    reason: "opposite_hand_reference"; matches_observed_side: false;
  } | null;
  rank: number;
  camera_kind: string;
  render_camera: RenderCamera;
  score_kind: "weighted_rrf" | "semantic_similarity" | null;
  rank_score: number | null;
  score_is_accuracy: false;
  asset: { transport: "library_bvh" | "inline_bvh"; bvh_sha256: string; preview_bvh_url: string };
  lookup_allowed: true;
  review_required: true;
  auto_apply_allowed: false;
  refine_allowed: false;
  export_allowed: false;
  release_allowed: false;
  actual_mesh_validated: false;
}
export interface PosePresentation {
  version: string;
  person_index: number;
  route: string;
  status: string;
  search_status: string;
  search_reason: string | null;
  generation_status: string | null;
  generation_reason: string | null;
  output_scope: string | null;
  unobserved_body_is_default: boolean | null;
  library_candidates: PreviewCandidate[];
  review_candidates: PreviewCandidate[];
  generated_candidates: PreviewCandidate[];
  mirror_comparison?: { status: "ready" | "unavailable" | "not_requested"; reason: string | null } | null;
  basic_model: { status: string; output_scope: string | null } | null;
  issues: string[];
  preview_status: string;
  auto_apply_allowed: false;
  refine_allowed: false;
  export_allowed: false;
}
