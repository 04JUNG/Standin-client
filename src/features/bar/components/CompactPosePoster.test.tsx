import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { apiFetchResponse } from "@/shared/api/client";
import { DefaultPoseImage } from "@/features/pose-viewer/components/DefaultPoseImage";
import type { PreviewCandidate } from "@/features/pose-viewer/api/posePresentation";
import { posterResponse, POSTER_SOURCE } from "@/test/posePosterFixture";
import { MemoryRouter, useLocation } from "react-router-dom";
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
it("bar enlargement reuses a verified poster without fetching any body/model artifact", async () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <CompactPoseLayout>
        <DefaultPoseImage candidate={candidate} />
      </CompactPoseLayout>
    </QueryClientProvider>,
  );
  const enlarge = await screen.findByRole("button", {
    name: "4번 기본 체형 포즈 참고 이미지 확대",
  });
  expect(apiFetchResponse).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiFetchResponse).mock.calls[0][0]).toContain("/poster?scope=full");
  const src = screen.getByAltText("4번 기본 체형 포즈 참고").getAttribute("src");
  fireEvent.click(enlarge);
  expect(screen.getByAltText("4번 기본 체형 포즈 참고 확대")).toHaveAttribute("src", src);
  expect(apiFetchResponse).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

it("Escape from an enlarged bar poster preserves the candidate route and focus", async () => {
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
  const enlarge = await screen.findByRole("button", {
    name: "4번 기본 체형 포즈 참고 이미지 확대",
  });
  enlarge.focus();
  fireEvent.click(enlarge);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByTestId("route")).toHaveTextContent("/bar/candidates");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(enlarge).toHaveFocus();
});
