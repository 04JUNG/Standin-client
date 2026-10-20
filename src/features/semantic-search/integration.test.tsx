import { useInstallationStore } from "@/features/installation/installationStore";
import { posterResponse } from "@/test/posePosterFixture";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { poseHttp } from "@/features/pose-viewer/api/pose.http";
import { useRefineSelection } from "@/features/pose-viewer/hooks/useRefineSelection";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { SemanticCandidates } from "./SemanticCandidates";
import { searchPoses, searchCapabilities } from "./api";

const refine = vi.hoisted(() => vi.fn());
vi.mock("@/features/pose-viewer/api/refine.service", () => ({
  refineService: { refineSelection: refine },
}));
function result() {
  return {
    source: "semantic",
    semantic: { query: "던지는 자세", index: { tags_version: "v1" } },
    jobId: "job_saved",
    notes: [],
    capabilities: {
      handSelection: true,
      refine: true,
      bodyPreviews: true,
      fbxExport: true,
      characterSelection: true,
    },
    candidatesByPerson: [
      {
        personIndex: 0,
        refineAllowed: false,
        confidence: "low",
        skeletonState: "missing",
        skeletonSource: "none",
        coverageClass: "insufficient",
        fallbackMode: "none",
        box: null,
        tags: {},
        candidates: ["throw", "throw_mirror"].map((id, i) => ({
          id: `${id}::front`,
          poseId: id,
          rank: 1,
          view: "front",
          tags: ["던지기"],
          matchLevel: "medium",
          bvhAvailable: true,
          semantic: { familyId: "throw", alternate: i > 0, description: "공을 던지는 자세" },
        })),
      },
    ],
  };
}
beforeEach(() => {
  __resetApiClient();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "device", consentVersion: "test" },
  });
  setInstallationCredentials({ installationId: "owner", deviceToken: "device" });
  refine.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetApiClient();
});
it("text search uses authenticated BFF JSON, never the inference server", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "no_result", jobId: null }));
  vi.stubGlobal("fetch", fetcher);
  await searchPoses(" 던지기 ");
  expect(fetcher.mock.calls[0]![0]).toMatch(/\/v1\/semantic-search$/);
  expect(fetcher.mock.calls[0]![1].headers["X-Device-Token"]).toBe("device");
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ query: "던지기", topK: null });
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBeUndefined();
});
it("rejects empty/overlong query before network and malformed capabilities/results", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ status: "ok", jobId: "invented" }));
  vi.stubGlobal("fetch", fetcher);
  await expect(searchPoses(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(searchPoses("a".repeat(501))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(searchPoses("던지기")).rejects.toMatchObject({ code: "SEMANTIC_CONTRACT" });
  await expect(searchCapabilities()).rejects.toMatchObject({ code: "SEMANTIC_CONTRACT" });
});
it("accepts current and previous server limits and preserves the negotiated request size", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const maxTopK of [10, 20]) {
    fetcher.mockResolvedValueOnce(Response.json({ available: true, maxQueryLength: 500, maxTopK }));
    const capabilities = await searchCapabilities();
    fetcher.mockResolvedValueOnce(Response.json({ status: "no_result", jobId: null }));
    await searchPoses("던지기", undefined, capabilities.maxTopK);
    expect(JSON.parse(fetcher.mock.calls[fetcher.mock.calls.length - 1]![1].body).topK).toBe(
      maxTopK,
    );
  }
  for (const topK of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(searchPoses("던지기", undefined, topK)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("history loads a text job without uploading and keeps both source ids for export", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(result()));
  vi.stubGlobal("fetch", fetcher);
  const data = await poseHttp.loadResult({ jobId: "job_saved" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(data.source).toBe("semantic");
  expect(data.semantic?.query).toBe("던지는 자세");
  expect(data.capabilities.refine).toBe(false);
  expect(data.capabilities.handSelection).toBe(true);
  expect(data.capabilities.bodyPreviews).toBe(false);
  expect(data.people[0]!.candidates[1]!.bvhUrl).toContain("throw_mirror/export?");
  expect(data.people[0]!.candidates[1]!.bvhUrl).toContain("candidateId=throw_mirror%3A%3Afront");
  usePoseSelectionStore.getState().startJob("job_saved", null);
  usePoseSelectionStore.getState().selectCandidate(0, "throw_mirror::front");
  const { result: hook } = renderHook(() => useRefineSelection(data));
  await waitFor(() => expect(hook.current.status).toBe("done"));
  expect(refine).not.toHaveBeenCalled();
});
it("groups variants in one card and switches to an actual alternate id, with no implicit selection", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation((url: string) =>
        url.includes("/poster?") ? posterResponse() : Promise.resolve(Response.json(result())),
      ),
  );
  const data = await poseHttp.loadResult({ jobId: "job_saved" });
  const select = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticCandidates candidates={data.people[0]!.candidates} onSelect={select} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByText("문장 검색")).toBeInTheDocument();
  expect(select).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "throw_mirror::front" } });
  expect(select).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  act(() => fireEvent.click(screen.getByRole("button")));
  expect(select).toHaveBeenCalledWith("throw_mirror::front");
});

it("loads the full result once without slicing, thumbnail fetches or conversion", async () => {
  const raw = result();
  const first = raw.candidatesByPerson[0].candidates[0];
  raw.candidatesByPerson[0].candidates = Array.from({ length: 92 }, (_, i) => ({
    ...first,
    id: `pose${i}::front`,
    poseId: `pose${i}`,
    rank: i + 1,
  }));
  const fetcher = vi.fn().mockResolvedValue(Response.json(raw));
  vi.stubGlobal("fetch", fetcher);
  const data = await poseHttp.loadResult({ jobId: "job_saved" });
  expect(data.people[0].candidates).toHaveLength(92);
  expect(data.people[0].candidates.at(-1)?.id).toBe("pose91::front");
  expect(fetcher).toHaveBeenCalledOnce();
});
