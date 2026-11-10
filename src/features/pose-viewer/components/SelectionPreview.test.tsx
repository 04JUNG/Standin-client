import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SelectionPreview } from "./SelectionPreview";
import { loadReferenceBvh } from "../api/humanReference";
import { referenceSurface } from "../preview/humanReference/surface";
import type { PersonResult } from "../api/pose.contract";

vi.mock("../api/posePoster", () => ({ useDefaultPosePoster: () => ({}) }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("../api/humanReference", async (original) => ({
  ...(await original<typeof import("../api/humanReference")>()),
  loadHumanTemplate: vi.fn(),
  loadReferenceBvh: vi.fn(),
}));
vi.mock("../preview/humanReference/surface", () => ({
  referenceSurface: vi.fn(),
  referenceSurfaceCamera: vi.fn(),
}));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({
    surface,
    fallback,
  }: {
    surface: { body: THREE.Group };
    fallback: React.ReactNode;
  }) => (
    <div data-testid="surface">
      {surface.body.name}
      {fallback}
    </div>
  ),
}));

const person = {
  index: 0,
  candidates: ["one", "two"].map((id, index) => ({
    id,
    rank: index + 1,
    title: id,
    thumbnailUrl: `/${id}.png`,
    posterUrl: `/v1/pose-candidates/${id}/poster?candidateId=${id}`,
  })),
} as PersonResult;

function model(name: string) {
  const body = new THREE.Group();
  body.name = name;
  return { body, bounds: new THREE.Box3(), characterSha: "a".repeat(64), release: vi.fn() };
}

beforeEach(() => vi.resetAllMocks());

it("starts the fixed-body preview immediately and discards the previous candidate's late source", async () => {
  let resolveOld!: (text: string) => void;
  const latest = model("latest pose");
  vi.mocked(loadReferenceBvh)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce("latest");
  vi.mocked(referenceSurface).mockReturnValue(latest);

  const view = render(<SelectionPreview job="job" person={person} selectedId="one" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  const oldSignal = vi.mocked(loadReferenceBvh).mock.calls[0][3];
  view.rerender(<SelectionPreview job="job" person={person} selectedId="two" />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/two.png");
  expect(await screen.findByTestId("surface")).toHaveTextContent("latest pose");

  await act(async () => resolveOld("old"));
  expect(referenceSurface).toHaveBeenCalledOnce();
  expect(screen.getByTestId("surface")).toHaveTextContent("latest pose");
  view.unmount();
  expect(latest.release).toHaveBeenCalledOnce();
});

it("keeps the poster on a source error and retries the default-body preview", async () => {
  vi.mocked(loadReferenceBvh).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce("bvh");
  vi.mocked(referenceSurface).mockReturnValue(model("retry"));
  render(<SelectionPreview job="job" person={person} />);
  const retry = await screen.findByRole("button", { name: "3D 다시 시도" });
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  fireEvent.click(retry);
  expect(await screen.findByTestId("surface")).toHaveTextContent("retry");
});
