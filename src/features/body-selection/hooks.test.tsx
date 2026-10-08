import { createElement } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { useBodies, useBodyControls } from "./hooks";
import { bodyKeys } from "./api";
import type { BodySelection } from "./contract";
const api = vi.hoisted(() => ({
  getSelection: vi.fn(),
  putSelection: vi.fn(),
  getOptions: vi.fn(),
  getManifest: vi.fn(),
  renderBodyCandidate: vi.fn(),
}));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...api,
}));
const ref = (id: string) => ({
  bodyId: id,
  characterId: id,
  bodyVersion: "1",
  assetSha256: id.repeat(64),
  rigVersion: "1",
  measurementVersion: "1",
});
const selection = (revision = 0, id = "a", index = 0): BodySelection => ({
  schemaVersion: "body-selection.v1",
  personIndex: index,
  intent: "inherit",
  manualCharacterId: null,
  recommendation: { status: "available", body: ref(id), reasonCodes: [] },
  resolvedBody: ref(id),
  resolvedSource: "auto_recommendation",
  resolutionStatus: "ready",
  selectionRevision: revision,
});
const people = [0, 1].map((index) => ({
  index,
  candidates: [1, 2].map((n) => ({ id: "p" + n, poseId: "p" + n, rank: n })),
  fallbackMode: "none",
}));
const result = {
  jobId: "server-job",
  capabilities: { bodyPreviews: true },
  people,
} as AnalysisResult;
function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "test", consentVersion: "2026-08-02" },
  });
  api.getSelection.mockImplementation(async (_job, index) => selection(0, "a", index));
  api.getOptions.mockResolvedValue({ catalogRevision: "1", characters: [] });
  api.getManifest.mockImplementation(async (job, index, s) => ({
    jobId: job,
    personIndex: index,
    selectionRevision: s.selectionRevision,
    resolvedBody: s.resolvedBody,
    renderKey: s.resolvedBody.characterId,
    candidates: [{ candidateId: "p1" }, { candidateId: "p2" }],
  }));
  api.renderBodyCandidate.mockImplementation(
    async (m, c) => m.resolvedBody.characterId + ":" + c.candidateId,
  );
});
describe("server body groups", () => {
  it("does not select a pose, uses real person IDs and actual candidate count", async () => {
    const { wrapper } = setup();
    const h = renderHook(() => useBodies(result), { wrapper });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(h.result.current.entries[0]?.group?.images).toEqual({ p1: "a:p1", p2: "a:p2" });
    expect(h.result.current.entries[1]?.selection?.personIndex).toBe(1);
    expect(api.putSelection).not.toHaveBeenCalled();
  });
  it("publishes all images atomically and ignores a late cancelled body render", async () => {
    const { wrapper, qc } = setup();
    let finish!: () => void;
    const h = renderHook(() => useBodies(result), { wrapper });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    api.renderBodyCandidate.mockImplementation(async (m, c) => {
      if (m.resolvedBody.characterId === "b" && c.candidateId === "p2")
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return m.resolvedBody.characterId + ":" + c.candidateId;
    });
    act(() => qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), selection(1, "b")));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(h.result.current.entries[0]?.group).toBeUndefined();
    act(() => qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), selection(2, "c")));
    await waitFor(() => expect(h.result.current.entries[0]?.group?.images.p2).toBe("c:p2"));
    act(() => finish());
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(h.result.current.entries[0]?.group?.images.p1).toBe("c:p1");
    expect(h.result.current.entries[1]?.group?.images.p1).toBe("a:p1");
  });
  it("partial render failure prevents continuing and never exposes the old body image", async () => {
    const { wrapper, qc } = setup();
    const h = renderHook(() => useBodies(result), { wrapper });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    api.renderBodyCandidate.mockRejectedValue(new Error("offline"));
    act(() => qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), selection(1, "b")));
    await waitFor(() => expect(h.result.current.entries[0]?.error).toBeTruthy());
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.entries[0]?.group).toBeUndefined();
  });
  it("body mutation updates only body queries, never invalidates analysis or pose selection", async () => {
    const { wrapper, qc } = setup();
    qc.setQueryData(["analysis", "result", "local"], { jobId: "immutable" });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    api.putSelection.mockResolvedValue(selection(1, "b"));
    const h = renderHook(() => useBodyControls("server-job", result.people[0]!, selection()), {
      wrapper,
    });
    await act(async () => {
      await h.result.current.mutation.mutateAsync({ intent: "manual", characterId: "b" });
    });
    expect(api.putSelection).toHaveBeenCalledWith(
      "server-job",
      0,
      { intent: "manual", characterId: "b" },
      0,
    );
    expect(qc.getQueryData(["analysis", "result", "local"])).toEqual({ jobId: "immutable" });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("legacy results never invoke body APIs", () => {
    const { wrapper } = setup();
    const h = renderHook(
      () =>
        useBodies({
          ...result,
          capabilities: { refine: false, fbxExport: false, characterSelection: false },
        }),
      { wrapper },
    );
    expect(h.result.current.ready).toBe(true);
    expect(api.getSelection).not.toHaveBeenCalled();
  });
  it("missing installation does not reveal another installation cache", async () => {
    const { wrapper, qc } = setup();
    qc.setQueryData(bodyKeys.selection("other", "server-job", 0), selection());
    useInstallationStore.setState({ credentials: null });
    const h = renderHook(() => useBodies(result), { wrapper });
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.entries[0]?.selection).toBeUndefined();
  });
});
