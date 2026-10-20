import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DefaultPoseImage } from "./DefaultPoseImage";
import { PoseCandidateCard } from "./PoseCandidateCard";
import type { PreviewCandidate } from "../api/posePresentation";
import type { PoseCandidate } from "../api/pose.contract";
const poster = vi.hoisted(() => ({
  method: "reference-skinning-v1" as "reference-skinning-v1" | undefined,
}));
vi.mock("../api/posePoster", () => ({
  useDefaultPosePoster: () => ({
    data: { url: "data:image/png;base64,AA==", kind: "default-body", method: poster.method },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
beforeEach(() => {
  poster.method = "reference-skinning-v1";
});
it.each([false, true])("presentation images omit repeated captions (compact=%s)", (compact) => {
  const candidate = {
    source: "library",
    rank: 1,
    asset: { preview_bvh_url: "/v1/poster", bvh_sha256: "a".repeat(64) },
  } as PreviewCandidate;
  render(<DefaultPoseImage candidate={candidate} scope="half" compact={compact} />);
  expect(screen.queryByText(/대략적인 포즈|정면 반신 참고|체형·손·보는 각도/)).toBeNull();
  expect(screen.queryByTitle(/대략적인 포즈/)).toBeNull();
  expect(screen.getByRole("img", { name: "기본 체형 포즈 참고" })).toHaveClass(
    compact ? "h-[110px]" : "aspect-square",
  );
});
it("normal selection cards keep the pose name and image without repeated captions", () => {
  const candidate = {
    id: "pose",
    poseId: "pose",
    rank: 1,
    title: "포즈",
    tags: [],
    matchLevel: "low",
    thumbnailUrl: "",
    bvhAvailable: true,
    previewImages: [],
    posterScope: "half",
  } as PoseCandidate;
  render(
    <PoseCandidateCard
      candidate={candidate}
      isSelected={false}
      onSelect={() => {}}
      layout="fill"
    />,
  );
  expect(screen.queryByText(/대략적인 포즈|정면 반신 참고|체형·손·보는 각도/)).toBeNull();
  expect(screen.queryByTitle(/대략적인 포즈/)).toBeNull();
  expect(screen.getByRole("img", { name: "포즈" })).toBeInTheDocument();
  expect(screen.getByRole("button")).toBeEnabled();
});
it("a frozen body poster also omits provenance text while retaining its accessible image name", () => {
  poster.method = undefined;
  const candidate = {
    source: "library",
    rank: 1,
    asset: { preview_bvh_url: "/v1/poster", bvh_sha256: "a".repeat(64) },
  } as PreviewCandidate;
  render(<DefaultPoseImage candidate={candidate} />);
  expect(screen.queryByText(/기본 체형 · 정면 전신 참고/)).toBeNull();
  expect(screen.getByRole("img", { name: "기본 체형 포즈 참고" })).toBeInTheDocument();
  expect(screen.queryByText(/근사 포즈/)).toBeNull();
});
