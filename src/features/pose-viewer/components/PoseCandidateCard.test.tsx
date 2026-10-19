import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PoseCandidateCard } from "./PoseCandidateCard";
import type { PoseCandidate } from "../api/pose.contract";
import { apiFetchResponse } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { POSTER_SOURCE, POSTER_URL, posterResponse } from "@/test/posePosterFixture";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const candidate: PoseCandidate = {
  id: "pose",
  poseId: "pose",
  rank: 1,
  title: "포즈",
  tags: [],
  matchLevel: "medium",
  thumbnailUrl: "",
  posterUrl: POSTER_URL,
  sourceBvhSha256: POSTER_SOURCE,
  previewImages: [],
  bvhAvailable: true,
};
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
  });
});
afterEach(() => useInstallationStore.setState({ credentials: null }));
it("waits only for its poster, then permits selection without invoking aligned/body/model conversion", async () => {
  let finish!: (r: Response) => void;
  vi.mocked(apiFetchResponse).mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const qc = new QueryClient();
  const choose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <PoseCandidateCard candidate={candidate} isSelected={false} onSelect={choose} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button")).toBeDisabled();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => finish(await posterResponse()));
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("button"));
  expect(choose).toHaveBeenCalledOnce();
  expect(vi.mocked(apiFetchResponse).mock.calls.map(([url]) => url)).toEqual([
    POSTER_URL + "&scope=full",
  ]);
});
it("body changes keep the same default image and issue zero new render requests", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() => posterResponse());
  const qc = new QueryClient();
  const view = (body: string) => (
    <QueryClientProvider client={qc}>
      <PoseCandidateCard
        candidate={candidate}
        characterId={body}
        bodyPreview={{ pending: true }}
        isSelected={false}
        onSelect={() => {}}
      />
    </QueryClientProvider>
  );
  const r = render(view("child"));
  await screen.findByRole("img");
  const url = screen.getByRole("img").getAttribute("src");
  r.rerender(view("female-muscle"));
  expect(screen.getByRole("img")).toHaveAttribute("src", url);
  expect(screen.getByRole("button")).toBeEnabled();
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  expect(screen.getByText(/선택 체형·손·검색 시점 미적용/)).toBeTruthy();
});
it("a malformed source-bound poster fails closed and never starts an expensive fallback", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() =>
    posterResponse({ "X-Standin-Source-BVH-SHA256": "d".repeat(64) }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PoseCandidateCard candidate={candidate} isSelected={false} onSelect={() => {}} />
    </QueryClientProvider>,
  );
  await screen.findByText("미리보기 다시 시도");
  expect(screen.queryByRole("img")).toBeNull();
  expect(apiFetchResponse).toHaveBeenCalledOnce();
});
it("scope changes require that exact scope, while a delayed old response cannot replace it", async () => {
  const finish: ((r: Response) => void)[] = [];
  vi.mocked(apiFetchResponse).mockImplementation(() => new Promise((r) => finish.push(r)));
  const qc = new QueryClient();
  const card = (scope: "full" | "half") => (
    <QueryClientProvider client={qc}>
      <PoseCandidateCard
        candidate={{ ...candidate, posterScope: scope }}
        isSelected={false}
        onSelect={() => {}}
      />
    </QueryClientProvider>
  );
  const r = render(card("full"));
  await waitFor(() => expect(finish).toHaveLength(1));
  r.rerender(card("half"));
  await waitFor(() => expect(finish).toHaveLength(2));
  await act(async () => finish[0](await posterResponse()));
  expect(screen.queryByRole("img")).toBeNull();
  await act(async () => finish[1](await posterResponse({}, "half")));
  await screen.findByRole("img");
  expect(screen.getByText(/정면 반신 참고/)).toBeTruthy();
});
