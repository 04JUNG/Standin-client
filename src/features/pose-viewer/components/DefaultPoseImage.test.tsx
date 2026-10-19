import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { posterResponse, POSTER_URL, POSTER_SOURCE } from "@/test/posePosterFixture";
import { DefaultPoseImage } from "./DefaultPoseImage";
import { loadPosePoster } from "../api/posePoster";
import type { PreviewCandidate } from "../api/posePresentation";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
beforeEach(() => {
  vi.mocked(apiFetchResponse).mockReset();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "test" },
  });
});
afterEach(() => {
  useInstallationStore.setState({ credentials: null });
});
it("checks all poster provenance before a browser displays the PNG", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() => posterResponse());
  expect((await loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE)).kind).toBe(
    "default-body",
  );
  for (const header of [
    "X-Standin-Poster-Kind",
    "X-Standin-Poster-Version",
    "X-Standin-Source-BVH-SHA256",
    "X-Standin-Output-Scope",
    "X-Standin-Preview-Only",
    "X-Standin-Preview-Projection",
    "X-Standin-Character-Id",
    "X-Standin-Character-SHA256",
    "X-Standin-Artifact-SHA256",
    "X-Standin-Preview-Revision",
  ]) {
    vi.mocked(apiFetchResponse).mockImplementation(() => posterResponse({ [header]: "changed" }));
    await expect(
      loadPosePoster(POSTER_URL, new AbortController().signal, POSTER_SOURCE),
    ).rejects.toThrow();
  }
  vi.mocked(apiFetchResponse).mockClear();
  await expect(
    loadPosePoster("https://other.invalid/poster", new AbortController().signal),
  ).rejects.toThrow();
  expect(apiFetchResponse).not.toHaveBeenCalled();
});
it("five cards prepare independently: a slow last poster cannot hold the first four hostage", async () => {
  const finish: ((r: Response) => void)[] = [];
  vi.mocked(apiFetchResponse).mockImplementation(() => new Promise((r) => finish.push(r)));
  const qc = new QueryClient();
  const candidates = Array.from(
    { length: 5 },
    (_, i) =>
      ({
        source: "library",
        candidate_id: "preview_" + String(i).repeat(64),
        asset: {
          bvh_sha256: POSTER_SOURCE,
          preview_bvh_url:
            "/v1/analysis/jobs/job/people/0/pose-previews/preview_" +
            String(i).repeat(64) +
            "/" +
            POSTER_SOURCE,
        },
      }) as PreviewCandidate,
  );
  const r = render(
    <QueryClientProvider client={qc}>
      {candidates.map((c) => (
        <DefaultPoseImage key={c.candidate_id} candidate={c} />
      ))}
    </QueryClientProvider>,
  );
  await waitFor(() => expect(finish).toHaveLength(5));
  for (let i = 0; i < 4; i++) await act(async () => finish[i](await posterResponse()));
  await waitFor(() => expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(4));
  expect(
    vi
      .mocked(apiFetchResponse)
      .mock.calls.every(([url]) => String(url).includes("/poster?scope=full")),
  ).toBe(true);
  await act(async () => finish[4](await posterResponse()));
  await waitFor(() => expect(screen.getAllByAltText("기본 체형 포즈 참고")).toHaveLength(5));
  r.unmount();
  qc.clear();
});
