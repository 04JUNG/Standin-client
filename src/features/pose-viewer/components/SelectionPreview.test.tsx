import { useLocalBodies, localSelectionKey } from "@/features/personal-body/store";
import type { LocalModel } from "@/features/personal-body/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localBodyApi } from "@/features/personal-body/api";
import { act } from "@testing-library/react";
vi.mock("@/features/personal-body/api", () => ({ localBodyApi: { preview: vi.fn() } }));
vi.mock("@/features/personal-body/LocalFbxPreview", () => ({
  LocalFbxPreview: () => <div>private registered model</div>,
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { SelectionPreview } from "./SelectionPreview";
import { apiFetchResponse } from "@/shared/api/client";
import { loadApprovedModel } from "../preview/humanReference/approvedModels";
import { humanFixture, bvhFixture } from "@/test/humanReferenceFixture";
import type { BodyEntry } from "@/features/body-selection/hooks";
import type { PersonResult } from "../api/pose.contract";
vi.mock("../api/posePoster", () => ({ useDefaultPosePoster: () => ({}) }));
vi.mock("@/features/body-selection/hooks", () => ({ useBodyOwner: () => "owner" }));
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
vi.mock("../preview/humanReference/approvedModels", () => ({ loadApprovedModel: vi.fn() }));
vi.mock("../interactive/InteractivePose", () => ({
  InteractivePose: () => <div data-testid="surface">local surface</div>,
}));
const bvh = bvhFixture();
const sha = createHash("sha256").update(bvh).digest("hex");
let sequence = 0;
const makePerson = (): PersonResult =>
  ({
    index: 0,
    candidates: ["one", "two"].map((id, index) => ({
      id: `${++sequence}-${id}`,
      rank: index + 1,
      title: id,
      sourceBvhSha256: sha,
      thumbnailUrl: `/${id}.png`,
      posterUrl: `/v1/pose-candidates/${sequence}-${id}/poster?candidateId=${id}`,
    })),
  }) as PersonResult;
const entry = {
  personIndex: 0,
  ready: true,
  error: null,
  retry: vi.fn(),
  selection: {
    personIndex: 0,
    selectionRevision: 3,
    resolvedBody: { characterId: "female-base-v0-4-0" },
  },
} as unknown as BodyEntry;
const response = () =>
  new Response(bvh, {
    headers: {
      "X-Standin-Source-BVH-SHA256": sha,
      "X-Standin-Output-Scope": "full",
      "X-Standin-Preview-Only": "true",
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  useLocalBodies.setState({ models: [], selected: {} });
  vi.mocked(loadApprovedModel).mockResolvedValue({
    template: humanFixture(),
    skin: { baseSha: "", joints: [], weights: [[]] },
    corrections: {
      restRotations: humanFixture().joints.map(() => [0, 0, 0, 1]),
      drivers: [],
      lifts: [],
      shapes: [],
    },
  });
  vi.mocked(apiFetchResponse).mockImplementation(async () => response());
});
it("uses the approved female model with local posing and never requests a server conversion", async () => {
  const person = makePerson();
  const view = render(<SelectionPreview job="job" person={person} entry={entry} />);
  expect(await screen.findByTestId("surface")).toHaveTextContent("local surface");
  expect(loadApprovedModel).toHaveBeenLastCalledWith("female", "full", expect.any(AbortSignal));
  expect(screen.getByText("여성 기본형 · 참고용 포즈")).toBeInTheDocument();
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  expect(vi.mocked(apiFetchResponse).mock.calls[0][0]).toContain("/poster-source?");
  expect(vi.mocked(apiFetchResponse).mock.calls[0][1]?.method).not.toBe("POST");
  view.unmount();
});
it("reuses a verified BVH when returning to an earlier candidate", async () => {
  const person = makePerson();
  const props = { job: "job", person, entry };
  const view = render(<SelectionPreview {...props} selectedId={person.candidates[0].id} />);
  await screen.findByTestId("surface");
  view.rerender(<SelectionPreview {...props} selectedId={person.candidates[1].id} />);
  await waitFor(() => expect(apiFetchResponse).toHaveBeenCalledTimes(2));
  await screen.findByTestId("surface");
  view.rerender(<SelectionPreview {...props} selectedId={person.candidates[0].id} />);
  await screen.findByTestId("surface");
  expect(apiFetchResponse).toHaveBeenCalledTimes(2);
});
it("changes only the base preview model when switching gender, preserving body controls", async () => {
  const person = makePerson();
  const view = render(<SelectionPreview job="job" person={person} entry={entry} />);
  await screen.findByTestId("surface");
  const male = {
    ...entry,
    selection: {
      ...entry.selection!,
      resolvedBody: { ...entry.selection!.resolvedBody!, characterId: "male-base-v0-8-0" },
    },
  };
  const saved = JSON.stringify(male);
  view.rerender(<SelectionPreview job="job" person={person} entry={male} />);
  await screen.findByTestId("surface");
  expect(loadApprovedModel).toHaveBeenLastCalledWith("male", "full", expect.any(AbortSignal));
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  expect(JSON.stringify(male)).toBe(saved);
});
it("aborts stale requests and lets a failed source retry without a converter fallback", async () => {
  const person = makePerson();
  vi.mocked(apiFetchResponse)
    .mockImplementationOnce(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener("abort", () => reject(Error("aborted")), {
            once: true,
          });
        }),
    )
    .mockRejectedValueOnce(Error("offline"))
    .mockImplementation(async () => response());
  const view = render(<SelectionPreview job="job" person={person} entry={entry} />);
  await waitFor(() => expect(apiFetchResponse).toHaveBeenCalledOnce());
  const signal = vi.mocked(apiFetchResponse).mock.calls[0][1]!.signal!;
  view.rerender(
    <SelectionPreview
      job="job"
      person={person}
      entry={entry}
      selectedId={person.candidates[1].id}
    />,
  );
  expect(signal.aborted).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "3D 다시 시도" }));
  await screen.findByTestId("surface");
  expect(
    vi
      .mocked(apiFetchResponse)
      .mock.calls.every(([path]) => String(path).includes("poster-source")),
  ).toBe(true);
});

it("unmounts server preview and suppresses server appearance controls for a personal selection", async () => {
  const props = {
    job: "local-preview",
    person: makePerson(),
    entry,
    bodiesEnabled: true,
    canonicalPreview: true,
  };
  const r = render(
    <QueryClientProvider client={new QueryClient()}>
      <SelectionPreview {...props} />
    </QueryClientProvider>,
  );
  const model = {
    localModelId: "private-model",
    name: "private body",
    sourceHash: "a".repeat(64),
    version: 1,
  } as LocalModel;
  vi.mocked(localBodyApi.preview).mockResolvedValue(new Uint8Array([1]));
  act(() =>
    useLocalBodies.setState({
      models: [model],
      selected: { [localSelectionKey(props.job, 0)]: model.localModelId },
    }),
  );
  await waitFor(() => expect(localBodyApi.preview).toHaveBeenCalledOnce());
  expect(screen.getByText("private registered model")).toBeInTheDocument();
  expect(screen.getByText(/등록한 모습/)).toBeInTheDocument();
  expect(screen.queryByRole("slider", { name: "외곽선 두께" })).not.toBeInTheDocument();
  act(() => useLocalBodies.getState().select(localSelectionKey(props.job, 0)));
  await waitFor(() =>
    expect(screen.queryByText("private registered model")).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(screen.getByTestId("surface")).toBeInTheDocument());
  r.unmount();
});
