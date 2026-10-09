import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PoseCandidateCard } from "./PoseCandidateCard";
import type { PoseCandidate } from "../api/pose.contract";
import { apiFetchBlob } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiFetchBlob: vi.fn() }));
const candidate: PoseCandidate = {
  id: "pose::back",
  poseId: "pose",
  rank: 1,
  title: "포즈",
  tags: ["front"],
  matchLevel: "medium",
  thumbnailUrl: "",
  previewImages: [],
  bvhAvailable: true,
  deferredThumbnailUrl: "/v1/pose-candidates/pose/aligned?jobId=test",
};
afterEach(() => vi.clearAllMocks());
it("shows an independently loading camera and enables selection only after the image arrives", async () => {
  let finish!: (value: Blob) => void;
  vi.mocked(apiFetchBlob).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const select = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PoseCandidateCard candidate={candidate} isSelected={false} onSelect={select} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("각도 맞추는 중")).toBeInTheDocument();
  expect(screen.getByRole("button")).toBeDisabled();
  await act(async () =>
    finish(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })),
  );
  await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  expect(screen.getByRole("button")).not.toBeDisabled();
  expect(apiFetchBlob).toHaveBeenCalledTimes(1);
});
it("uses the approximate library image before requesting any aligned preview", async () => {
  vi.mocked(apiFetchBlob).mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PoseCandidateCard
        candidate={{ ...candidate, quickThumbnailUrl: "/quick?view=front" }}
        isSelected={false}
        onSelect={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("미리보기 불러오는 중")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  expect(vi.mocked(apiFetchBlob).mock.calls.map(([url]) => url)).toEqual(["/quick?view=front"]);
});
it("offers retry instead of silently showing a legacy view", async () => {
  vi.mocked(apiFetchBlob).mockRejectedValue(new Error("render failed"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PoseCandidateCard candidate={candidate} isSelected={false} onSelect={() => {}} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("미리보기 다시 시도")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("never requests a legacy quick thumbnail while a selected-body preview is pending or ready", async () => {
  const client = new QueryClient();
  const card = (pending: boolean) => (
    <QueryClientProvider client={client}>
      <PoseCandidateCard
        candidate={{
          ...candidate,
          quickThumbnailUrl: "/quick-wrong-body",
          thumbnailUrl: "/old-body.png",
        }}
        bodyPreview={{ pending, url: pending ? undefined : "data:image/png;base64,Ym9keQ==" }}
        isSelected={false}
        onSelect={() => {}}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(card(true));
  expect(screen.getByRole("button")).toBeDisabled();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  rerender(card(false));
  expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,Ym9keQ==");
  expect(screen.getByRole("button")).not.toBeDisabled();
  expect(apiFetchBlob).not.toHaveBeenCalled();
});
