import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { PoseCandidateCard } from "./PoseCandidateCard";
import { ExpandablePose } from "../interactive/InteractivePose";
import type { PoseCandidate } from "../api/pose.contract";
import type { StaticAsset } from "../interactive/contract";
import { acquireAsset } from "../interactive/assets";
import { registerView } from "../interactive/renderer";

vi.mock("../interactive/assets", () => ({ acquireAsset: vi.fn() }));
vi.mock("../interactive/renderer", () => ({ registerView: vi.fn(), invalidate: vi.fn() }));
const asset = {
  url: "/v1/test-asset",
  sha256: "a".repeat(64),
  revision: "unchanged-revision",
  camera: { target: [0, 0, 0] },
} as StaticAsset;
const candidate: PoseCandidate = {
  id: "unselected",
  poseId: "unselected",
  rank: 2,
  title: "포즈 2",
  tags: [],
  matchLevel: "medium",
  thumbnailUrl: "",
  previewImages: [],
  bvhAvailable: true,
  interactivePreview: { version: "interactive-preview-v1", asset },
};

beforeEach(() => {
  vi.mocked(acquireAsset)
    .mockReset()
    .mockResolvedValue({ body: new THREE.Group(), release: vi.fn() });
  vi.mocked(registerView)
    .mockReset()
    .mockImplementation((view) => {
      view.ready();
      return vi.fn();
    });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each([undefined, "fill"] as const)(
  "adds one independent bottom-right magnifier without changing %s card layout",
  async (layout) => {
    const select = vi.fn(),
      ancestorPointer = vi.fn(),
      ancestorClick = vi.fn();
    const { container } = render(
      <div onPointerDown={ancestorPointer} onClick={ancestorClick}>
        <PoseCandidateCard
          candidate={candidate}
          jobId={`layout-${layout}`}
          layout={layout}
          isSelected={false}
          onSelect={select}
        />
      </div>,
    );
    await waitFor(() => expect(registerView).toHaveBeenCalledOnce());
    const magnifier = screen.getByRole("button", { name: "포즈 크게 보기" });
    expect(magnifier).toHaveClass("absolute", "bottom-1", "right-1", "h-10", "w-10");
    expect(magnifier.querySelector("svg")).toHaveClass("lucide-zoom-in");
    expect(screen.queryByRole("button", { name: "처음 시점" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(container.querySelector("button button")).toBeNull();
    const card = container.querySelector("[data-pose-candidate]")!;
    expect(card.firstElementChild).toHaveClass(
      ...(layout === "fill" ? ["min-h-0", "flex-1"] : ["aspect-square"]),
    );
    fireEvent.pointerDown(magnifier, { button: 0, pointerId: 1 });
    await userEvent.click(magnifier);
    const dialog = await screen.findByRole("dialog", { name: "포즈 크게 보기" });
    await waitFor(() => expect(registerView).toHaveBeenCalledTimes(2));
    expect(acquireAsset).toHaveBeenLastCalledWith(asset, expect.any(AbortSignal));
    expect(vi.mocked(registerView).mock.calls[1][0].camera).toBe(asset.camera);
    expect(select).not.toHaveBeenCalled();
    expect(ancestorPointer).not.toHaveBeenCalled();
    expect(ancestorClick).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "처음 시점" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "확대" })).toBeInTheDocument();
    const escape = vi.fn();
    window.addEventListener("keydown", escape);
    await userEvent.keyboard("{Escape}");
    window.removeEventListener("keydown", escape);
    expect(escape).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(magnifier).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "이 포즈 선택" }));
    expect(select).toHaveBeenCalledOnce();
  },
);

it.each(["{Enter}", " "])(
  "opens via %s, traps focus, closes and restores the same angle and revision",
  async (key) => {
    render(
      <PoseCandidateCard
        candidate={candidate}
        jobId={`keyboard-${key}`}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(registerView).toHaveBeenCalledOnce());
    const cardView = vi.mocked(registerView).mock.calls[0][0];
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowLeft" });
    const angle = { ...cardView.observation() },
      identity = JSON.stringify(asset);
    const magnifier = screen.getByRole("button", { name: "포즈 크게 보기" });
    magnifier.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await userEvent.keyboard(key);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(registerView).toHaveBeenCalledTimes(2));
    expect(vi.mocked(registerView).mock.calls[1][0].observation()).toEqual(angle);
    const close = within(dialog).getByRole("button", { name: "닫기" });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "확대" })).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.click(close);
    expect(magnifier).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
    expect(cardView.observation()).toEqual(angle);
    expect(JSON.stringify(asset)).toBe(identity);
  },
);

it("keeps viewport dragging separate from expand and card selection", async () => {
  const select = vi.fn();
  render(
    <PoseCandidateCard candidate={candidate} jobId="drag" isSelected={false} onSelect={select} />,
  );
  await waitFor(() => expect(registerView).toHaveBeenCalledOnce());
  const viewport = screen.getByRole("application"),
    view = vi.mocked(registerView).mock.calls[0][0];
  const before = { ...view.observation() };
  viewport.setPointerCapture = vi.fn();
  viewport.releasePointerCapture = vi.fn();
  await userEvent.pointer([
    { target: viewport, keys: "[MouseLeft>]", coords: { clientX: 10, clientY: 20 } },
    { target: viewport, coords: { clientX: 40, clientY: 25 } },
    { target: viewport, keys: "[/MouseLeft]" },
  ]);
  expect(view.observation().yaw).not.toBe(before.yaw);
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("expands the exact supplied edited surface without acquiring a different asset", async () => {
  const body = new THREE.Group(),
    camera = asset.camera;
  const clone = vi.spyOn(body, "clone");
  render(
    <ExpandablePose
      surface={{ body, camera }}
      viewKey="edited-surface"
      showControls={false}
      showExpandButton
    />,
  );
  await waitFor(() => expect(registerView).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole("button", { name: "포즈 크게 보기" }));
  await waitFor(() => expect(registerView).toHaveBeenCalledTimes(2));
  expect(clone).toHaveBeenCalledTimes(2);
  expect(vi.mocked(registerView).mock.calls[1][0].camera).toBe(camera);
  expect(acquireAsset).not.toHaveBeenCalled();
});
