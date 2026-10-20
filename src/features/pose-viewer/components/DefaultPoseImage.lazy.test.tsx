import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DefaultPoseImage } from "./DefaultPoseImage";
import { apiFetchResponse } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";
import { useInstallationStore } from "@/features/installation/installationStore";
import { POSTER_SOURCE, posterResponse } from "@/test/posePosterFixture";
import type { PreviewCandidate } from "../api/posePresentation";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const candidate = {
  rank: 1,
  source: "library",
  asset: {
    bvh_sha256: POSTER_SOURCE,
    preview_bvh_url:
      "/v1/analysis/jobs/job/people/0/pose-previews/preview_" +
      "a".repeat(64) +
      "/" +
      POSTER_SOURCE,
  },
} as PreviewCandidate;
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "fake", consentVersion: "test" },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("fetches a stored PNG only when the card approaches the viewport", async () => {
  let intersect!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersect = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(apiFetchResponse).mockImplementation(() => posterResponse());
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <DefaultPoseImage candidate={candidate} savedOnly lazy />
    </QueryClientProvider>,
  );
  expect(apiFetchResponse).not.toHaveBeenCalled();
  act(() =>
    intersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  await screen.findByRole("img");
  expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  expect(String(vi.mocked(apiFetchResponse).mock.calls[0][0])).toContain("/poster?scope=full");
  view.unmount();
});
it("a missing stored PNG never falls back to BVH, a mesh, or a render", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.mocked(apiFetchResponse).mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DefaultPoseImage candidate={candidate} savedOnly lazy />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("불러오지 못했어요"));
  expect(apiFetchResponse).toHaveBeenCalledOnce();
});
