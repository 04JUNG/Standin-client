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
it("presentation cards label the approximate body and retain a single compact caption row", () => {
  const candidate = {
    source: "library",
    rank: 1,
    asset: { preview_bvh_url: "/v1/poster", bvh_sha256: "a".repeat(64) },
  } as PreviewCandidate;
  render(<DefaultPoseImage candidate={candidate} scope="half" compact />);
  const caption = screen.getByText("기본 체형 · 대략적인 포즈 · 정면 반신 참고");
  expect(caption).toHaveClass("truncate", "whitespace-nowrap");
  expect(caption).toHaveAttribute("title", "기본 체형 · 대략적인 포즈 · 정면 반신 참고");
  expect(screen.getByRole("img")).toHaveClass("h-[110px]");
});
it("normal selection cards keep approximation visible without wrapping the image area", () => {
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
  const caption = screen.getByText("기본 체형 · 대략적인 포즈 · 정면 반신 참고");
  expect(caption).toHaveClass("truncate", "whitespace-nowrap");
  expect(caption).toHaveAttribute("title", "기본 체형 · 대략적인 포즈 · 정면 반신 참고");
});
it("a frozen body poster does not claim to use approximate reference skinning", () => {
  poster.method = undefined;
  const candidate = {
    source: "library",
    rank: 1,
    asset: { preview_bvh_url: "/v1/poster", bvh_sha256: "a".repeat(64) },
  } as PreviewCandidate;
  render(<DefaultPoseImage candidate={candidate} />);
  expect(screen.getByText("기본 체형 · 정면 전신 참고")).toBeInTheDocument();
  expect(screen.queryByText(/근사 포즈/)).toBeNull();
});
