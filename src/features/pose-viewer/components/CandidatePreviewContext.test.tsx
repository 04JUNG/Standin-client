import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CandidatePreviewProvider } from "./CandidatePreviewContext";
import { PoseCandidateCard } from "./PoseCandidateCard";
import { loadSelectionPacket } from "../interactive/selectionPacket";
import type { PersonResult } from "../api/pose.contract";
import type { BodyEntry } from "@/features/body-selection/hooks";
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("../api/posePoster", () => ({
  useDefaultPosePoster: () => ({ data: { url: "poster.png" }, isPending: false, isError: false }),
}));
vi.mock("../interactive/selectionPacket", () => ({ loadSelectionPacket: vi.fn() }));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({
    surface,
    large,
    renderLayer,
  }: {
    surface: unknown;
    large: boolean;
    renderLayer: number;
  }) => (
    <div data-testid="interactive" data-large={large} data-layer={renderLayer}>
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
    previewImages: [],
    bvhAvailable: true,
  })),
} as PersonResult;
const entry = {
  ready: true,
  selection: {
    personIndex: 0,
    selectionRevision: 3,
    resolvedBody: { characterId: "approved", assetSha256: "a".repeat(64) },
  },
} as BodyEntry;
beforeEach(() => vi.clearAllMocks());
it.each([undefined, "fill"] as const)(
  "opens a static %s card's own packet only on inspection, preserves selection, and releases it on close",
  async (layout) => {
    const select = vi.fn(),
      release = vi.fn();
    vi.mocked(loadSelectionPacket).mockResolvedValue({
      body: new THREE.Group(),
      camera: {} as never,
      release,
    });
    const props = { job: "job", person, entry, bodiesEnabled: true, canonicalPreview: true };
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
    expect(loadSelectionPacket).not.toHaveBeenCalled();
    expect(r.container.querySelector("button button")).toBeNull();
    const zoom = screen.getByRole("button", { name: "포즈 크게 보기" });
    expect(zoom).toHaveClass("bottom-1", "right-1");
    await userEvent.click(zoom);
    const dialog = await screen.findByRole("dialog", { name: "포즈 크게 보기" });
    await waitFor(() => expect(loadSelectionPacket).toHaveBeenCalledOnce());
    expect(loadSelectionPacket).toHaveBeenCalledWith(
      "job",
      entry.selection,
      person.candidates[1],
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(within(dialog).getByTestId("interactive")).toHaveTextContent("verified surface");
    expect(within(dialog).getByTestId("interactive")).toHaveAttribute("data-large", "true");
    expect(within(dialog).getByTestId("interactive")).toHaveAttribute("data-layer", "1");
    expect(select).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zoom).toHaveFocus();
    expect(release).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByAltText("포즈 2"));
    expect(select).toHaveBeenCalledOnce();
  },
);
it("does not expose or request unsupported packet previews", () => {
  render(
    <CandidatePreviewProvider
      job="job"
      person={person}
      entry={entry}
      bodiesEnabled
      canonicalPreview={false}
    >
      <PoseCandidateCard candidate={person.candidates[0]} isSelected={false} onSelect={vi.fn()} />
    </CandidatePreviewProvider>,
  );
  expect(screen.queryByRole("button", { name: "포즈 크게 보기" })).toBeNull();
  expect(loadSelectionPacket).not.toHaveBeenCalled();
});
