import { createElement } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { useBodies, useBodyControls } from "./hooks";
import { bodyDraftKey, useBodyDrafts } from "./bodyDrafts";
import { bodyKeys } from "./api";
import type { BodySelection } from "./contract";
import { readOutputScope } from "@/features/pose-viewer/api/outputScope";
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
  useBodyDrafts.setState({ pending: {} });
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
    outputScope: "full",
    candidates: [{ candidateId: "p1" }, { candidateId: "p2" }],
  }));
  api.renderBodyCandidate.mockImplementation(
    async (m, c) => m.resolvedBody.characterId + ":" + c.candidateId,
  );
});
describe("server body groups", () => {
  it("blocks confirmation throughout the slider debounce, excluding people not exported", async () => {
    const { wrapper } = setup();
    const hook = renderHook(({ excluded }) => useBodies(result, excluded), {
      wrapper,
      initialProps: { excluded: {} as Record<number, boolean> },
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const key = bodyDraftKey("owner", "server-job", 0);
    act(() => useBodyDrafts.getState().setPending(key, true));
    expect(hook.result.current.ready).toBe(false);
    hook.rerender({ excluded: { 0: true } });
    expect(hook.result.current.ready).toBe(true);
    hook.rerender({ excluded: {} });
    act(() => useBodyDrafts.getState().setPending(key, false));
    expect(hook.result.current.ready).toBe(true);
  });
  it("scope and body/shape changes commit one consistent group and discard a late half render", async () => {
    const { wrapper, qc } = setup();
    let currentScope = "half";
    let finish!: () => void;
    const withScope = (scope: "half" | "head"): AnalysisResult => ({
      ...result,
      people: result.people.map((p) =>
        p.index === 0
          ? {
              ...p,
              outputScope: {
                ...readOutputScope(undefined),
                selection: scope,
                resolved: scope,
                resolutionSource: "user",
              },
            }
          : p,
      ),
    });
    api.getManifest.mockImplementation(async (_job, index, s) => ({
      resolvedBody: s.resolvedBody,
      outputScope: index === 0 ? currentScope : "full",
      candidates: [{ candidateId: "p1" }, { candidateId: "p2" }],
    }));
    api.renderBodyCandidate.mockImplementation(async (m, c) => {
      if (m.resolvedBody.characterId === "b" && m.outputScope === "half" && c.candidateId === "p2")
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return m.outputScope + ":" + m.resolvedBody.characterId + ":" + c.candidateId;
    });
    const h = renderHook(({ data }) => useBodies(data, {}, true), {
      wrapper,
      initialProps: { data: withScope("half") },
    });
    await waitFor(() => expect(h.result.current.entries[0]?.group?.images.p1).toBe("half:a:p1"));
    act(() =>
      qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), {
        ...selection(1, "b"),
        shape: {
          schemaVersion: "body-shape.v1",
          controls: { height: 186 },
          shapeSha256: "c".repeat(64),
        },
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(h.result.current.entries[0]?.group).toBeUndefined();
    currentScope = "head";
    h.rerender({ data: withScope("head") });
    await waitFor(() => expect(h.result.current.entries[0]?.group?.images.p2).toBe("head:b:p2"));
    act(() => finish());
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(h.result.current.entries[0]?.group?.images).toEqual({
      p1: "head:b:p1",
      p2: "head:b:p2",
    });
    expect(h.result.current.entries[1]?.group?.images.p1).toBe("full:a:p1");
    expect(result.people[0]?.candidates).toHaveLength(2);
  });
  it("does not select a pose, uses real person IDs and actual candidate count", async () => {
    const { wrapper } = setup();
    const h = renderHook(() => useBodies(result, {}, true), { wrapper });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(h.result.current.entries[0]?.group?.images).toEqual({ p1: "a:p1", p2: "a:p2" });
    expect(h.result.current.entries[1]?.selection?.personIndex).toBe(1);
    expect(api.putSelection).not.toHaveBeenCalled();
  });
  it("publishes all images atomically and ignores a late cancelled body render", async () => {
    const { wrapper, qc } = setup();
    let finish!: () => void;
    const h = renderHook(() => useBodies(result, {}, true), { wrapper });
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
    const h = renderHook(() => useBodies(result, {}, true), { wrapper });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    api.renderBodyCandidate.mockRejectedValue(new Error("offline"));
    act(() => qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), selection(1, "b")));
    await waitFor(() => expect(h.result.current.entries[0]?.error).toBeTruthy());
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.entries[0]?.group).toBeUndefined();
  });
  it("retry recovers a failed initial selection without rendering an undefined body", async () => {
    const { wrapper } = setup();
    api.getSelection.mockRejectedValue(new Error("offline"));
    const h = renderHook(() => useBodies(result, {}, true), { wrapper });
    await waitFor(() => expect(h.result.current.entries[0]?.error).toBeTruthy());
    expect(api.getManifest).not.toHaveBeenCalled();
    api.getSelection.mockImplementation(async (_job, index) => selection(2, "b", index));
    await act(async () => {
      await Promise.all(h.result.current.entries.map((entry) => entry.retry()));
    });
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    expect(api.getManifest.mock.calls.every((call) => call[2]?.selectionRevision === 2)).toBe(true);
    expect(h.result.current.entries[0]?.group?.images.p1).toBe("b:p1");
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
    const h = renderHook(() => useBodies(result, {}, true), { wrapper });
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.entries[0]?.selection).toBeUndefined();
  });
});

it("default Top-5 and body changes never request selected-body manifests or renders", async () => {
  const { wrapper, qc } = setup();
  const h = renderHook(() => useBodies(result), { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(api.getManifest).not.toHaveBeenCalled();
  expect(api.renderBodyCandidate).not.toHaveBeenCalled();
  act(() => qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), selection(1, "b")));
  await waitFor(() => expect(h.result.current.entries[0]?.selection?.selectionRevision).toBe(1));
  expect(h.result.current.entries[0]?.group).toBeUndefined();
  expect(api.getManifest).not.toHaveBeenCalled();
  expect(api.renderBodyCandidate).not.toHaveBeenCalled();
  h.unmount();
  qc.clear();
});

it("a ready male fallback unlocks confirmation, while missing assets still block it", async () => {
  const { wrapper, qc } = setup();
  const fallback = (index: number): BodySelection => ({
    ...selection(0, "a", index),
    recommendation: { status: "disabled", body: null, reasonCodes: [] },
    resolvedBody: { ...ref("a"), characterId: "male-base-v0-7-2" },
    resolvedSource: "catalog_default_fallback",
  });
  api.getSelection.mockImplementation(async (_job, index) => fallback(index));
  const { result: hook } = renderHook(() => useBodies(result), { wrapper });
  await waitFor(() => expect(hook.current.ready).toBe(true));
  expect(
    hook.current.entries.every(
      (e) => e.selection?.resolvedBody?.characterId === "male-base-v0-7-2",
    ),
  ).toBe(true);
  act(() =>
    qc.setQueryData(bodyKeys.selection("owner", "server-job", 0), {
      ...fallback(0),
      resolvedBody: null,
      resolutionStatus: "unavailable",
    }),
  );
  await waitFor(() => expect(hook.current.ready).toBe(false));
  expect(hook.current.entries[0].error?.message).toContain("남성 기본형을 불러올 수 없어요");
});
