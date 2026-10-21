import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PosePresentationPanel } from "./PosePresentationPanel";
import type { PosePresentation } from "../api/posePresentation";
import type { PreviewCandidate } from "../api/posePresentation";
vi.mock("./DefaultPoseImage", () => ({
  DefaultPoseImage: ({ candidate }: { candidate: PreviewCandidate }) => (
    <img src={candidate.asset.preview_bvh_url + "/poster"} alt="기본 포즈 참고 이미지" />
  ),
}));
vi.mock("./BasicCloseupReference", () => ({
  BasicCloseupReference: ({ compact }: { compact: boolean }) => (
    <div>기본 클로즈업 {String(compact)}</div>
  ),
}));
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
it.each([false, true])(
  "shows a basic close-up instead of an empty candidate panel (compact=%s)",
  (compact) => {
    render(
      <PosePresentationPanel
        compact={compact}
        presentation={{
          ...p,
          route: "basic_model",
          status: "basic_reference",
          search_status: "ok",
          output_scope: "shoulder_head",
          basic_model: { status: "planned", output_scope: "shoulder_head" },
        }}
      />,
    );
    expect(screen.getByText(`기본 클로즈업 ${String(compact)}`)).toBeTruthy();
    expect(screen.queryByText("후보 없음")).toBeNull();
    expect(screen.queryByText(/비슷한 포즈를 찾지 못했어요/)).toBeNull();
  },
);
it.each([false, true])("shows empty state and generation rejection (compact=%s)", (compact) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PosePresentationPanel presentation={p} compact={compact} />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("검색 후보 0개")).toBeNull();
  expect(screen.getByText("후보 없음")).toBeTruthy();
  expect(screen.getByRole("status")).toBeTruthy();
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
  fireEvent.click(screen.getByAltText("기본 포즈 참고 이미지"));
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

it.each([false, true])(
  "keeps mirror identity without repeated descriptions or extra permissions (compact=%s)",
  (compact) => {
    const camera = {
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      projection_matches_search: false,
    };
    const rows = Array.from({ length: 4 }, (_, i) => ({
      candidate_id: `original_${i}`,
      pose_id: `pose_${i}`,
      kind: "library_match",
      rank: i + 1,
      asset: { preview_bvh_url: `/v1/original_${i}`, bvh_sha256: "a".repeat(64) },
      render_camera: camera,
    })) as PreviewCandidate[];
    const mirror = {
      ...rows[0]!,
      candidate_id: "mirror",
      pose_id: "real_mirror",
      kind: "mirror_reference",
      rank: 1,
      asset: { preview_bvh_url: "/v1/real_mirror", bvh_sha256: "b".repeat(64) },
      mirror_comparison: {
        family_id: "pair",
        original_pose_id: "pose_0",
        original_bvh_sha256: "a".repeat(64),
        original_candidate_id: "original_0",
        is_mirror: true,
        observed_side: "left",
        reference_side: "right",
        reason: "opposite_hand_reference",
        matches_observed_side: false,
      },
    } as PreviewCandidate;
    const client = new QueryClient();
    for (const row of [...rows, mirror]) {
      client.setQueryData(["pose-bvh-source", row.asset.preview_bvh_url], "bvh");
      client.setQueryData(
        ["pose-bvh-render", row.asset.preview_bvh_url, p.output_scope, row.render_camera],
        "data:image/png;base64,AA==",
      );
    }
    const { container } = render(
      <QueryClientProvider client={client}>
        <PosePresentationPanel
          compact={compact}
          presentation={{
            ...p,
            status: "ready",
            search_status: "ok",
            generation_status: null,
            library_candidates: rows,
            review_candidates: [mirror],
            mirror_comparison: { status: "ready", reason: "opposite_hand_reference" },
          }}
        />
      </QueryClientProvider>,
    );
    expect(container.querySelectorAll("[data-presentation-candidate]")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "검색 후보 1" })).toBeNull();
    expect(document.getElementById("pose-candidate-original_0")).toBeInTheDocument();
    expect(screen.getByText("5. 좌우 반전 포즈")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5번 좌우 반전 포즈 이미지로 선택" })).toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/러프에는|러프와 반대쪽|가려진 부분|의 좌우 반전 포즈/)).toBeNull();
    expect(mirror.mirror_comparison).toMatchObject({
      original_candidate_id: "original_0",
      observed_side: "left",
      reference_side: "right",
      matches_observed_side: false,
    });
    expect(screen.queryByRole("button", { name: /저장|보정|적용/ })).toBeNull();
  },
);
it("missing mirror keeps the returned candidate count without a summary notice", () => {
  render(
    <PosePresentationPanel
      presentation={{
        ...p,
        mirror_comparison: { status: "unavailable", reason: "bound_mirror_not_available" },
      }}
    />,
  );
  expect(screen.queryByText(/좌우를 바꾼 포즈는 준비하지 못했어요/)).toBeNull();
  expect(screen.getByText("후보 없음")).toBeInTheDocument();
});

it("not-requested mirror adds no unavailable notice or empty mirror section", () => {
  render(
    <PosePresentationPanel
      presentation={{ ...p, mirror_comparison: { status: "not_requested", reason: null } }}
    />,
  );
  expect(screen.queryByText(/좌우를 바꾼 포즈|좌우 반전 포즈 0개/)).toBeNull();
});

it("distinguishes failed and empty searches without raw diagnostics", () => {
  const { rerender } = render(
    <PosePresentationPanel
      presentation={{
        ...p,
        status: "partial_error",
        search_status: "partial_error",
        search_reason: "hand_skin_screen_unavailable_no_generation",
      }}
    />,
  );
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByText(/hand_skin/)).toBeNull();
  rerender(
    <PosePresentationPanel
      presentation={{
        ...p,
        status: "no_result",
        search_status: "no_result",
        search_reason: "no_original_within_geometry_cutoff",
        generation_status: null,
      }}
    />,
  );
  expect(screen.getByRole("status")).toBeTruthy();
});

it.each([false, true])(
  "all five reference photos use the selection button callback (compact=%s)",
  (compact) => {
    const onSelect = vi.fn();
    const rows = Array.from({ length: 5 }, (_, i) => ({
      candidate_id: `photo-${i}`,
      rank: i + 1,
      kind: "library_match",
      asset: { preview_bvh_url: `/v1/photo-${i}` },
    })) as PreviewCandidate[];
    const candidates = rows.map((row) => ({
      id: row.candidate_id,
      source: "library",
      lookupAllowed: true,
      releaseAllowed: true,
      sourceBvhSha256: "a".repeat(64),
    })) as import("../api/pose.contract").PoseCandidate[];
    const view = (disabled: boolean) => (
      <PosePresentationPanel
        presentation={{ ...p, library_candidates: rows }}
        compact={compact}
        selection={{ candidates, onSelect, disabled }}
      />
    );
    const { rerender } = render(view(false));
    const images = screen.getAllByAltText("기본 포즈 참고 이미지");
    for (let i = 0; i < 5; i++) {
      fireEvent.click(images[i]);
      expect(onSelect).toHaveBeenLastCalledWith(`photo-${i}`);
      fireEvent.click(screen.getByRole("button", { name: `${i + 1}번 검색 후보 선택` }));
      expect(onSelect).toHaveBeenLastCalledWith(`photo-${i}`);
    }
    expect(onSelect).toHaveBeenCalledTimes(10);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(view(true));
    for (const image of screen.getAllByAltText("기본 포즈 참고 이미지")) {
      expect(image.closest("button")).toBeDisabled();
      fireEvent.click(image);
    }
    expect(onSelect).toHaveBeenCalledTimes(10);
    rerender(
      <PosePresentationPanel
        presentation={{ ...p, library_candidates: rows }}
        compact={compact}
        selection={{
          candidates: candidates.map((c) => ({ ...c, releaseAllowed: false })),
          onSelect,
        }}
      />,
    );
    for (const image of screen.getAllByAltText("기본 포즈 참고 이미지")) {
      expect(image.closest("button")).toBeDisabled();
      fireEvent.click(image);
    }
    expect(onSelect).toHaveBeenCalledTimes(10);
  },
);

it.each([false, true])(
  "semantic appends all returned candidates and keeps near references separate (compact=%s)",
  (compact) => {
    const candidate = {
      candidate_id: "template",
      pose_id: "pose",
      source: "library",
      kind: "library_match",
      rank: 1,
      asset: {
        transport: "library_bvh",
        bvh_sha256: "b".repeat(64),
        preview_bvh_url: "/v1/preview",
      },
    } as PreviewCandidate;
    const library = Array.from({ length: 65 }, (_, i) => ({
      ...candidate,
      candidate_id: `regular${i}`,
      rank: i + 1,
    }));
    const near = Array.from({ length: 27 }, (_, i) => ({
      ...candidate,
      candidate_id: `near${i}`,
      kind: "near_match",
      rank: i + 1,
    }));
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PosePresentationPanel
          compact={compact}
          presentation={{
            ...p,
            version: "semantic-pose-presentation-v1",
            library_candidates: library,
            review_candidates: near,
          }}
          selection={{
            candidates: [...library, ...near].map((c) => ({
              id: c.candidate_id,
              source: "semantic",
              manualExportAllowed: true,
              bvhAvailable: true,
              lookupAllowed: true,
              sourceBvhSha256: "b".repeat(64),
            })) as never[],
            onSelect,
          }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("검색 후보 65개")).toBeInTheDocument();
    expect(screen.getByText("비슷한 다른 포즈 27개")).toBeInTheDocument();
    expect(screen.getAllByAltText("기본 포즈 참고 이미지")).toHaveLength(40);
    for (let i = 0; i < 3; i++)
      fireEvent.click(screen.getByRole("button", { name: "검색 후보 20개 더 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "비슷한 다른 포즈 20개 더 보기" }));
    expect(screen.getAllByAltText("기본 포즈 참고 이미지")).toHaveLength(92);
    fireEvent.click(screen.getByRole("button", { name: "65번 검색 후보 선택" }));
    expect(onSelect).toHaveBeenCalledWith("regular64");
    fireEvent.click(screen.getAllByAltText("기본 포즈 참고 이미지")[64]);
    expect(onSelect).toHaveBeenLastCalledWith("regular64");
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it.each(["failed", "error", "timeout", "rejected"])(
  "keeps %s generation failure visible beside empty search",
  (generation_status) => {
    render(<PosePresentationPanel presentation={{ ...p, generation_status }} />);
    expect(screen.getByText("후보 없음")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("찾지 못했어요");
    expect(screen.getByText(/만들지 못했습니다|시간이 오래|확인 과정을 통과/)).toBeTruthy();
    expect(screen.queryByText(/후보 0개/)).toBeNull();
  },
);
