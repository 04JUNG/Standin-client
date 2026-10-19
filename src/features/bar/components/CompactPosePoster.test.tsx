import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { apiFetchResponse } from "@/shared/api/client";
import { DefaultPoseImage } from "@/features/pose-viewer/components/DefaultPoseImage";
import type { PreviewCandidate } from "@/features/pose-viewer/api/posePresentation";
import { posterResponse, POSTER_SOURCE } from "@/test/posePosterFixture";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SinglePoseDetail } from "@/features/body-selection/SinglePoseDetail";
import { BarShell } from "./BarShell";
import { CompactPoseLayout } from "./CompactPoseLayout";

vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const candidate = {
  rank: 4,
  source: "library",
  candidate_id: "preview_" + "4".repeat(64),
  asset: {
    bvh_sha256: POSTER_SOURCE,
    preview_bvh_url:
      "/v1/analysis/jobs/job/people/0/pose-previews/preview_" +
      "4".repeat(64) +
      "/" +
      POSTER_SOURCE,
  },
} as PreviewCandidate;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(apiFetchResponse)
    .mockReset()
    .mockImplementation(() => posterResponse());
  useInstallationStore.setState({
    credentials: {
      installationId: "fixture-owner",
      deviceToken: "fixture-device",
      consentVersion: "fixture",
    },
  });
});
afterEach(() => {
  useInstallationStore.setState({ credentials: null });
  vi.unstubAllGlobals();
});
it("bar poster has no enlargement action or extra body/model request", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompactPoseLayout>
        <DefaultPoseImage candidate={candidate} />
      </CompactPoseLayout>
    </QueryClientProvider>,
  );
  const image = await screen.findByAltText("4번 기본 체형 포즈 참고");
  expect(apiFetchResponse).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiFetchResponse).mock.calls[0][0]).toContain("/poster?scope=full");
  fireEvent.click(image);
  expect(screen.queryByRole("button", { name: /이미지 확대/ })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(apiFetchResponse).toHaveBeenCalledTimes(1);
});
it("desktop presentation keeps its existing plain image without the compact enlargement action", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DefaultPoseImage candidate={candidate} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByAltText("기본 체형 포즈 참고")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /이미지 확대/ })).not.toBeInTheDocument();
});

it("clicking the poster does not navigate the bar or open a dialog", async () => {
  function Location() {
    return <p data-testid="route">{useLocation().pathname}</p>;
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/bar/candidates"]}>
        <BarShell>
          <DefaultPoseImage candidate={candidate} />
          <Location />
        </BarShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByAltText("4번 기본 체형 포즈 참고"));
  expect(screen.getByTestId("route")).toHaveTextContent("/bar/candidates");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("compact detail keeps unavailable body rendering disabled and shows one shared reference notice", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompactPoseLayout>
        <SinglePoseDetail job="fixture-job" candidateId="candidate" />
      </CompactPoseLayout>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button", { name: "고른 체형으로 이 포즈 보기" })).toBeDisabled();
  expect(screen.getByText("고른 체형으로 보기")).toBeInTheDocument();
  expect(
    screen.getByText("기본 체형의 정면 모습이에요. 저장할 모습과 다를 수 있어요."),
  ).toBeInTheDocument();
  expect(apiFetchResponse).not.toHaveBeenCalled();
});
