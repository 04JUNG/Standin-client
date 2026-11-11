import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { SelectionPreview } from "./SelectionPreview";
import { loadSelectionModel, prepareSelectionSurface } from "../interactive/selectionPacket";
import type { BodyEntry } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
vi.mock("../api/posePoster", () => ({ useDefaultPosePoster: () => ({}) }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("../interactive/selectionPacket", () => ({
  loadSelectionModel: vi.fn(),
  prepareSelectionSurface: vi.fn(),
}));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: ({ surface }: { surface: { body: THREE.Group } }) => (
    <div data-testid="surface">{surface.body.name}</div>
  ),
}));
const person = {
  index: 0,
  candidates: ["one", "two"].map((id, index) => ({
    id,
    rank: index + 1,
    title: id,
    sourceBvhSha256: id.repeat(64).slice(0, 64),
    thumbnailUrl: `/${id}.png`,
    posterUrl: `/v1/pose-candidates/${id}/poster?candidateId=${id}`,
  })),
} as PersonResult;
const entry = {
  personIndex: 0,
  ready: true,
  error: null,
  retry: vi.fn(),
  selection: {
    personIndex: 0,
    selectionRevision: 3,
    resolutionStatus: "ready",
    resolvedBody: { characterId: "female-base-v0-4-0", assetSha256: "a".repeat(64) },
    shape: { shapeSha256: "b".repeat(64), controls: { height: 168 } },
  },
} as unknown as BodyEntry;
type Model = Awaited<ReturnType<typeof loadSelectionModel>>;
const packet = (name: string) => ({ name }) as unknown as Model;
const released: ReturnType<typeof vi.fn>[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  released.length = 0;
  vi.mocked(prepareSelectionSurface).mockImplementation((model) => {
    const body = new THREE.Group();
    body.name = (model as unknown as { name: string }).name;
    const release = vi.fn();
    released.push(release);
    return { body, camera: {} as ReturnType<typeof prepareSelectionSurface>["camera"], release };
  });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
it("loads selected body controls, cancels a replaced pose and releases its surface", async () => {
  vi.mocked(loadSelectionModel)
    .mockImplementationOnce(
      (_job, _body, _candidate, _scope, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        ),
    )
    .mockResolvedValueOnce(packet("latest pose"));
  const props = { job: "job", person, entry, canonicalPreview: true };
  const { wrapper } = setup();
  const view = render(<SelectionPreview {...props} selectedId="one" />, { wrapper });
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  await waitFor(() => expect(loadSelectionModel).toHaveBeenCalledOnce());
  const signal = vi.mocked(loadSelectionModel).mock.calls[0][4];
  view.rerender(<SelectionPreview {...props} selectedId="two" />);
  expect(signal.aborted).toBe(true);
  expect(await screen.findByTestId("surface")).toHaveTextContent("latest pose");
  expect(vi.mocked(loadSelectionModel).mock.calls[1].slice(0, 4)).toEqual([
    "job",
    entry.selection,
    person.candidates[1],
    "full",
  ]);
  view.unmount();
  expect(released[0]).toHaveBeenCalledOnce();
});
it("shares verified packets between inspectors with separate disposable GPU surfaces", async () => {
  vi.mocked(loadSelectionModel).mockResolvedValue(packet("same FBX"));
  const { wrapper } = setup();
  const view = render(
    <>
      <SelectionPreview job="job" person={person} entry={entry} canonicalPreview />
      <SelectionPreview job="job" person={person} entry={entry} canonicalPreview renderLayer={1} />
    </>,
    { wrapper },
  );
  expect(await screen.findAllByTestId("surface")).toHaveLength(2);
  expect(loadSelectionModel).toHaveBeenCalledOnce();
  expect(prepareSelectionSurface).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(released.every((release) => release.mock.calls.length === 1)).toBe(true);
});
it("keeps different people's canonical poses separate even with the same candidate and body", async () => {
  vi.mocked(loadSelectionModel).mockImplementation(async (_job, selection) =>
    packet(`person ${selection.personIndex}`),
  );
  const { wrapper } = setup();
  const other = {
    ...entry,
    personIndex: 1,
    selection: { ...entry.selection!, personIndex: 1 },
  };
  const view = render(
    <>
      <SelectionPreview job="job" person={person} entry={entry} canonicalPreview />
      <SelectionPreview
        job="job"
        person={{ ...person, index: 1 }}
        entry={other}
        canonicalPreview
      />
    </>,
    { wrapper },
  );
  await waitFor(() => expect(screen.getAllByTestId("surface")).toHaveLength(2));
  expect(screen.getAllByTestId("surface").map((el) => el.textContent)).toEqual([
    "person 0",
    "person 1",
  ]);
  expect(loadSelectionModel).toHaveBeenCalledTimes(2);
  view.unmount();
});
it("replaces stale custom bodies and retains the thumbnail on conversion failure", async () => {
  vi.mocked(loadSelectionModel)
    .mockResolvedValueOnce(packet("female"))
    .mockRejectedValueOnce(Error("network"))
    .mockResolvedValueOnce(packet("male"));
  const { wrapper } = setup();
  const props = { job: "job", person, canonicalPreview: true };
  const view = render(<SelectionPreview {...props} entry={entry} />, { wrapper });
  expect(await screen.findByTestId("surface")).toHaveTextContent("female");
  const changed = {
    ...entry,
    selection: {
      ...entry.selection!,
      selectionRevision: 4,
      resolvedBody: { ...entry.selection!.resolvedBody!, characterId: "male-base-v0-8-0" },
    },
  };
  view.rerender(<SelectionPreview {...props} entry={changed} />);
  expect(screen.queryByTestId("surface")).not.toBeInTheDocument();
  const retry = await screen.findByRole("button", { name: "3D 다시 시도" });
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
  fireEvent.click(retry);
  expect(await screen.findByTestId("surface")).toHaveTextContent("male");
  expect(released[0]).toHaveBeenCalledOnce();
});
it("does not request a model without capability or a ready body", async () => {
  const { wrapper } = setup();
  const view = render(<SelectionPreview job="job" person={person} entry={entry} />, { wrapper });
  view.rerender(
    <SelectionPreview
      job="job"
      person={person}
      entry={{ ...entry, ready: false }}
      canonicalPreview
    />,
  );
  await act(async () => {});
  expect(loadSelectionModel).not.toHaveBeenCalled();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/one.png");
});
