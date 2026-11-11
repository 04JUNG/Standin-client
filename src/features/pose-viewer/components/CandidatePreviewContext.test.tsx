import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CandidatePreviewProvider } from "./CandidatePreviewContext";
import { PoseCandidateCard } from "./PoseCandidateCard";
import { useSelectionSurface } from "../interactive/useSelectionSurface";
import type { PersonResult } from "../api/pose.contract";
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("../api/posePoster", () => ({
  useDefaultPosePoster: () => ({ data: { url: "poster.png" }, isPending: false, isError: false }),
}));
vi.mock("../interactive/useSelectionSurface", () => ({ useSelectionSurface: vi.fn() }));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({
    surface,
    fallback,
    large,
    renderLayer,
  }: {
    surface: unknown;
    fallback: React.ReactNode;
    large: boolean;
    renderLayer: number;
  }) => (
    <div data-testid="interactive" data-large={large} data-layer={renderLayer}>
      {fallback}
      {surface ? "verified surface" : "empty"}
    </div>
  ),
}));
const person = {
  index: 0,
  confidence: "high",
  skeletonState: "valid",
  skeletonSource: "full_image",
  coverageClass: "full",
  fallbackMode: "none",
  refineAllowed: false,
  refinableLimbs: [],
  candidates: ["one", "two"].map((id, i) => ({
    id,
    poseId: id,
    title: `포즈 ${i + 1}`,
    rank: i + 1,
    tags: [],
    matchLevel: "high",
    thumbnailUrl: "poster.png",
    posterUrl: `/v1/pose-candidates/${id}/poster?candidateId=${id}`,
    previewImages: [],
    bvhAvailable: true,
  })),
} as PersonResult;
beforeEach(() => vi.clearAllMocks());
it.each([undefined, "fill"] as const)(
  "opens a %s card's own pose on inspection, preserves selection, and releases it on close",
  async (layout) => {
    const select = vi.fn();
    vi.mocked(useSelectionSurface).mockReturnValue({
      binding: "verified",
      loading: false,
      failed: false,
      retry: async () => {},
      surface: { body: new THREE.Group(), camera: {} as never, release: vi.fn() },
    });
    const props = { job: "job", person, canonicalPreview: true };
    const r = render(
      <CandidatePreviewProvider {...props}>
        <PoseCandidateCard
          candidate={person.candidates[1]}
          isSelected={false}
          onSelect={select}
          layout={layout}
        />
      </CandidatePreviewProvider>,
    );
    expect(useSelectionSurface).not.toHaveBeenCalled();
    expect(r.container.querySelector("button button")).toBeNull();
    const zoom = screen.getByRole("button", { name: "포즈 크게 보기" });
    expect(zoom).toHaveClass("bottom-1", "right-1");
    await userEvent.click(zoom);
    const dialog = await screen.findByRole("dialog", { name: "포즈 크게 보기" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "poster.png");
    expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus();
    await waitFor(() => expect(useSelectionSurface).toHaveBeenCalled());
    expect(useSelectionSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({
        job: "job",
        candidate: person.candidates[1],
        enabled: true,
        scope: "full",
      }),
    );
    expect(within(dialog).getByTestId("interactive")).toHaveTextContent("verified surface");
    expect(within(dialog).getByTestId("interactive")).toHaveAttribute("data-large", "true");
    expect(within(dialog).getByTestId("interactive")).toHaveAttribute("data-layer", "1");
    expect(select).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zoom).toHaveFocus();
    fireEvent.click(screen.getByAltText("포즈 2"));
    expect(select).toHaveBeenCalledOnce();
  },
);
