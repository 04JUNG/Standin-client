import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SelectionPreview } from "./SelectionPreview";
import { loadSelectionPacket } from "../interactive/selectionPacket";
import type { BodyEntry } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
import type { StaticAsset } from "../interactive/contract";
import { useDefaultPosePoster } from "../api/posePoster";
vi.mock("../api/posePoster", () => ({ useDefaultPosePoster: vi.fn() }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "test-owner" }));
vi.mock("../interactive/selectionPacket", () => ({ loadSelectionPacket: vi.fn() }));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({
    surface,
    asset,
    appearance,
  }: {
    surface?: { body: THREE.Group };
    asset?: StaticAsset;
    appearance: { skin: string; outlineWidth: number };
  }) => (
    <div data-testid="surface">
      {surface?.body.name ?? asset?.url}:{appearance.skin}:{appearance.outlineWidth}
    </div>
  ),
}));
const person = {
  index: 0,
  candidates: [
    { id: "one", rank: 1, title: "One", thumbnailUrl: "/one.png" },
    { id: "two", rank: 2, title: "Two", thumbnailUrl: "/two.png" },
  ],
} as PersonResult;
const entry = {
  ready: true,
  selection: {
    personIndex: 0,
    selectionRevision: 1,
    resolutionStatus: "ready",
    resolvedBody: { characterId: "body", assetSha256: "a".repeat(64) },
  },
} as BodyEntry;
function surface(name: string) {
  const body = new THREE.Group();
  body.name = name;
  return {
    body,
    camera: {} as Awaited<ReturnType<typeof loadSelectionPacket>>["camera"],
    release: vi.fn(),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useDefaultPosePoster).mockReturnValue({} as ReturnType<typeof useDefaultPosePoster>);
});

const props = { job: "job", person, entry, bodiesEnabled: true, canonicalPreview: true };
const open3D = (parent: Pick<typeof screen, "getByRole"> = screen) =>
  fireEvent.click(
    parent.getByRole("button", {
      name: "선택한 체형으로 3D 보기",
    }),
  );

it("shows the current poster immediately, requests 3D on demand, and discards a late A response after selecting B", async () => {
  const old = surface("old"),
    latest = surface("latest");
  let resolveOld!: (value: typeof old) => void;
  vi.mocked(loadSelectionPacket)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(latest);

  const r = render(<SelectionPreview {...props} selectedId="one" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  expect(loadSelectionPacket).not.toHaveBeenCalled();
  open3D();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  const oldSignal = vi.mocked(loadSelectionPacket).mock.calls[0][4];

  r.rerender(<SelectionPreview {...props} selectedId="two" />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/two.png");
  expect(loadSelectionPacket).toHaveBeenCalledOnce();
  open3D();
  expect(await screen.findByTestId("surface")).toHaveTextContent("latest");
  await act(async () => resolveOld(old));
  expect(old.release).toHaveBeenCalledOnce();
  expect(screen.getByTestId("surface")).toHaveTextContent("latest");
  r.rerender(<SelectionPreview {...props} selectedId="one" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  expect(loadSelectionPacket).toHaveBeenCalledTimes(2);
  expect(latest.release).toHaveBeenCalledOnce();
});

it("uses the verified default asset and matching poster angle without requesting a packet", () => {
  const characterId = "male-default83-v0-7-6-p1";
  const hash = "085dd9c65a3a66035f7e0ce9e0a9171b9abb0e33dada92194676d92e00c8b026";
  const asset = {
    characterId,
    characterSha256: hash,
    url: "/v1/static",
    camera: {
      projection: "orthographic",
      torsoReferenceSha256: hash,
      viewMatrix: new THREE.Matrix4().makeRotationY(Math.PI * 1.25).toArray(),
    },
  } as StaticAsset;
  const withAsset: PersonResult = {
    ...person,
    candidates: [
      {
        ...person.candidates[0],
        interactivePreview: { version: "interactive-preview-v1", asset },
      },
    ],
  };
  vi.mocked(useDefaultPosePoster).mockReturnValue({
    data: { url: "/cached.png", camera: { yaw: 45, fallback: "none", source: "fixed_117" } },
  } as ReturnType<typeof useDefaultPosePoster>);
  const body = {
    ...entry,
    selection: {
      ...entry.selection!,
      resolvedBody: { ...entry.selection!.resolvedBody!, characterId, assetSha256: hash },
    },
  };
  const r = render(<SelectionPreview {...props} person={withAsset} entry={body} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/cached.png");
  fireEvent.click(screen.getByRole("button", { name: "기본 체형 3D로 회전" }));
  expect(screen.getByTestId("surface")).toHaveTextContent("/v1/static");
  expect(loadSelectionPacket).not.toHaveBeenCalled();
  r.rerender(<SelectionPreview {...props} person={withAsset} />);
  expect(screen.queryByTestId("surface")).toBeNull();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/cached.png");
});

it("keeps the poster visible on failure and retries only when requested", async () => {
  vi.mocked(loadSelectionPacket)
    .mockRejectedValueOnce(Error("network"))
    .mockResolvedValueOnce(surface("retry"));
  render(<SelectionPreview {...props} />);
  open3D();
  const retry = await screen.findByRole("button", { name: "3D 다시 시도" });
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  fireEvent.click(retry);
  expect(await screen.findByTestId("surface")).toHaveTextContent("retry");
  expect(loadSelectionPacket).toHaveBeenCalledTimes(2);
});

it("shares preview appearance without requesting a model from either image view", async () => {
  vi.mocked(loadSelectionPacket).mockResolvedValue(surface("body"));
  const view = (expanded: boolean) => (
    <>
      <div data-testid="persistent">
        <SelectionPreview {...props} />
      </div>
      {expanded && (
        <div data-testid="expanded">
          <SelectionPreview {...props} renderLayer={1} />
        </div>
      )}
      <div data-testid="other-job">
        <SelectionPreview {...props} job="other" />
      </div>
    </>
  );
  const r = render(view(true));
  const persistent = within(screen.getByTestId("persistent"));
  const expanded = within(screen.getByTestId("expanded"));
  fireEvent.click(expanded.getByRole("button", { name: "살색" }));
  fireEvent.change(expanded.getByRole("slider"), { target: { value: "0.25" } });
  expect(persistent.getByRole("slider")).toHaveValue("0.25");
  expect(within(screen.getByTestId("other-job")).getByRole("slider")).toHaveValue("0");
  expect(loadSelectionPacket).not.toHaveBeenCalled();
  r.rerender(view(false));
  r.rerender(view(true));
  expect(
    within(screen.getByTestId("expanded")).getByRole("button", { name: "살색" }),
  ).toHaveAttribute("aria-pressed", "true");
  open3D(persistent);
  expect(await persistent.findByTestId("surface")).toHaveTextContent("body:flesh:0.25");
  fireEvent.click(persistent.getByRole("button", { name: "기본" }));
  await waitFor(() =>
    expect(persistent.getByTestId("surface")).toHaveTextContent("body:default:0.25"),
  );
  expect(loadSelectionPacket).toHaveBeenCalledOnce();
});
