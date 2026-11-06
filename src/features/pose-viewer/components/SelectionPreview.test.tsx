import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SelectionPreview } from "./SelectionPreview";
import { loadSelectionPacket } from "../interactive/selectionPacket";
import type { BodyEntry } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "test-owner" }));
vi.mock("../interactive/selectionPacket", () => ({ loadSelectionPacket: vi.fn() }));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({
    surface,
    appearance,
  }: {
    surface?: { body: THREE.Group };
    appearance: { skin: string; outlineWidth: number };
  }) => (
    <div data-testid="surface">
      {surface?.body.name}:{appearance.skin}:{appearance.outlineWidth}
    </div>
  ),
}));
const person = {
  index: 0,
  candidates: [
    { id: "one", rank: 1, title: "One" },
    { id: "two", rank: 2, title: "Two" },
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
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
it("late pose response is disposed and cannot overwrite the newer selection", async () => {
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
  const props = { job: "job_race", person, entry, bodiesEnabled: true, canonicalPreview: true };
  const r = render(<SelectionPreview {...props} selectedId="one" />);
  await act(() => vi.advanceTimersByTimeAsync(120));
  const oldSignal = vi.mocked(loadSelectionPacket).mock.calls[0][4];
  r.rerender(<SelectionPreview {...props} selectedId="two" />);
  expect(oldSignal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(120));
  expect(screen.getByTestId("surface")).toHaveTextContent("latest");
  await act(async () => {
    resolveOld(old);
  });
  expect(old.release).toHaveBeenCalledOnce();
  expect(screen.getByTestId("surface")).toHaveTextContent("latest");
  r.unmount();
  expect(latest.release).toHaveBeenCalledOnce();
});
it("appearance changes keep the same prepared surface without another request", async () => {
  const model = surface("body");
  vi.mocked(loadSelectionPacket).mockResolvedValue(model);
  const r = render(
    <SelectionPreview
      job="job_style"
      person={person}
      entry={entry}
      bodiesEnabled
      canonicalPreview
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(120));
  fireEvent.click(screen.getByRole("button", { name: "살색" }));
  fireEvent.change(screen.getByRole("slider", { name: "외곽선 두께" }), { target: { value: "2" } });
  expect(screen.getByTestId("surface")).toHaveTextContent("body:flesh:2");
  expect(loadSelectionPacket).toHaveBeenCalledOnce();
  r.unmount();
  expect(model.release).toHaveBeenCalledOnce();
});
it("pending body changes retain an explicitly labelled previous view without issuing a stale request", async () => {
  const model = surface("former");
  vi.mocked(loadSelectionPacket).mockResolvedValue(model);
  const props = { job: "job_body", person, entry, bodiesEnabled: true, canonicalPreview: true };
  const r = render(<SelectionPreview {...props} />);
  await act(() => vi.advanceTimersByTimeAsync(120));
  r.rerender(<SelectionPreview {...props} entry={{ ...entry, ready: false }} />);
  expect(screen.getByTestId("surface")).toHaveTextContent("former");
  expect(screen.getByText(/지금은 이전 미리보기/)).toBeInTheDocument();
  expect(model.release).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(loadSelectionPacket).toHaveBeenCalledOnce();
  r.unmount();
});

it("synchronizes appearance between persistent and enlarged views, retains it on reopen, and isolates other jobs", async () => {
  const model = surface("shared");
  vi.mocked(loadSelectionPacket).mockResolvedValue(model);
  const props = {
    job: "job_shared_style",
    person,
    entry,
    bodiesEnabled: true,
    canonicalPreview: true,
  };
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
        <SelectionPreview {...props} job="job_other_style" />
      </div>
    </>
  );
  const r = render(view(true));
  await act(() => vi.advanceTimersByTimeAsync(120));
  const requests = vi.mocked(loadSelectionPacket).mock.calls.length;
  fireEvent.click(within(screen.getByTestId("expanded")).getByRole("button", { name: "살색" }));
  fireEvent.change(
    within(screen.getByTestId("expanded")).getByRole("slider", { name: "외곽선 두께" }),
    { target: { value: "0.25" } },
  );
  expect(within(screen.getByTestId("persistent")).getByTestId("surface")).toHaveTextContent(
    "shared:flesh:0.25",
  );
  expect(within(screen.getByTestId("other-job")).getByTestId("surface")).toHaveTextContent(
    "shared:default:0",
  );
  expect(loadSelectionPacket).toHaveBeenCalledTimes(requests);
  r.rerender(view(false));
  r.rerender(view(true));
  expect(
    within(screen.getByTestId("expanded")).getByRole("button", { name: "살색" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByTestId("expanded")).getByRole("slider")).toHaveValue("0.25");
  fireEvent.click(within(screen.getByTestId("persistent")).getByRole("button", { name: "기본" }));
  expect(
    within(screen.getByTestId("expanded")).getByRole("button", { name: "기본" }),
  ).toHaveAttribute("aria-pressed", "true");
});
