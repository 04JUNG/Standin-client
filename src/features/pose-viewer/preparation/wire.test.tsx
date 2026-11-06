import { createElement } from "react";
import { webcrypto } from "node:crypto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { useCandidatePreparation } from "./useCandidatePreparation";
import { usePreparedSelection } from "./usePreparedSelection";
import { useRefineSelection } from "../hooks/useRefineSelection";
import type { AnalysisResult, PoseCandidate } from "../api/pose.contract";
import { batchFixture, sourceHash, identities } from "./fixtures.testSupport";
import { reusePreparedSelection } from "./reuse";
import { loadPreparedSource, sourceSurface } from "./sourcePreview";
import { humanFixture, bvhFixture } from "@/test/humanReferenceFixture";
import { referenceDigest } from "../api/humanReference";
import { readBatch } from "./contract";
const refine = vi.hoisted(() => vi.fn());
vi.mock("../api/refine.service", () => ({ refineService: { refineSelection: refine } }));
const request = vi.fn();
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", request);
  request.mockReset();
  refine.mockReset();
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "private", consentVersion: "test" },
  });
  usePoseSelectionStore.setState({
    jobId: "local",
    serverJobId: "job_test",
    selectedByPerson: {},
    refineByPerson: {},
  });
});
afterEach(() => {
  useInstallationStore.setState({ credentials: null });
  vi.unstubAllGlobals();
});
function analysis(people = 1): AnalysisResult {
  return {
    jobId: "job_test",
    people: Array.from({ length: people }, (_, i) => ({
      index: i,
      candidates: Array.from(
        { length: 5 },
        (_, j) =>
          ({
            id: `candidate-${i * 5 + j}`,
            sourceBvhSha256: sourceHash,
            bvhUrl: `/v1/pose-candidates/source/export?jobId=job_test&personIndex=${i}&candidateId=candidate-${i * 5 + j}`,
          }) as PoseCandidate,
      ),
      confidence: "high",
      skeletonState: "valid",
      skeletonSource: "full_image",
      coverageClass: "full",
      fallbackMode: "none",
      refineAllowed: true,
      refinableLimbs: [],
    })),
    capabilities: {
      candidatePreparation: true,
      refine: true,
      fbxExport: true,
      characterSelection: true,
    },
  };
}
function provider(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}
it("prepares 15 candidates once; body/hands and app/bar remount never repeat source preparation", async () => {
  const batch = batchFixture(3);
  request.mockImplementation(async () => new Response(JSON.stringify(batch)));
  const client = new QueryClient(),
    result = analysis(3);
  const hook = renderHook(() => useCandidatePreparation(result, true), {
    wrapper: provider(client),
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => {
    usePoseSelectionStore.getState().setPersonCharacter(0, "changed-body");
  });
  hook.rerender();
  expect(hook.result.current.ready).toBe(true);
  hook.unmount();
  const bar = renderHook(() => useCandidatePreparation({ ...result }, true), {
    wrapper: provider(client),
  });
  await waitFor(() => expect(bar.result.current.ready).toBe(true));
  expect(request).toHaveBeenCalledTimes(1);
  const body = JSON.parse(request.mock.calls[0][1].body);
  expect(Object.keys(body).sort()).toEqual(["expectedRevision", "mutationId", "schemaVersion"]);
  expect(bar.result.current.batch?.candidates).toHaveLength(15);
  expect(usePoseSelectionStore.getState().refineByPerson).toEqual({});
});
it("reuses selected source and prevents legacy refine; validates each receipt identity", async () => {
  const batch = batchFixture(),
    result = analysis();
  const selected = batch.candidates[2],
    exportUrl = result.people[0].candidates[2].bvhUrl!;
  const response = {
    schemaVersion: batch.schemaVersion,
    batchId: batch.batchId,
    contextHash: batch.contextHash,
    selections: [
      {
        personIndex: 0,
        candidateId: selected.candidateId,
        resultId: selected.resultId,
        contextHash: selected.contextHash,
        outputSha256: selected.outputSha256,
        sourceReceipt: selected.validationReceipt,
        sourceUrl: selected.modelUrl,
        exportUrl,
        refined: true,
        reasonCode: "accepted",
        adjustedLimbs: [],
        thumbnailUrl: null,
      },
    ],
    targetApplicationRequired: true,
    finalFileVerified: false,
  };
  request.mockImplementation(
    async (url) => new Response(JSON.stringify(String(url).endsWith("/reuse") ? response : batch)),
  );
  usePoseSelectionStore.setState({ selectedByPerson: { 0: selected.candidateId } });
  const client = new QueryClient();
  const hook = renderHook(
    () => {
      const preparation = useCandidatePreparation(result, true);
      const reuse = usePreparedSelection(result, preparation, { 0: selected.candidateId });
      useRefineSelection(result, preparation.enabled);
      return reuse;
    },
    { wrapper: provider(client) },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(refine).not.toHaveBeenCalled();
  expect(usePoseSelectionStore.getState().refineByPerson[0].prepared?.outputSha256).toBe(
    selected.outputSha256,
  );
  expect(hook.result.current.outcomes[0].exportUrl).toBe(exportUrl);
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        ...response,
        selections: [{ ...response.selections[0], resultId: "other" }],
      }),
    ),
  );
  await expect(
    reusePreparedSelection(
      result,
      batch,
      { 0: selected.candidateId },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it("verifies exact source bytes, rejects corruption, and maps rotations on a fixed display rig", async () => {
  const text = bvhFixture(45),
    bytes = new TextEncoder().encode(text),
    sha = await referenceDigest(bytes);
  const batch = batchFixture(),
    candidate = batch.candidates[0];
  const asset = { ...candidate.previewAsset!, sha256: sha, bytes: bytes.length };
  request.mockImplementation(async () => new Response(bytes));
  expect((await loadPreparedSource(asset, new AbortController().signal)).text).toBe(text);
  request.mockImplementation(async () => new Response(new TextEncoder().encode(bvhFixture(46))));
  await expect(loadPreparedSource(asset, new AbortController().signal)).rejects.toThrow();
  const template = humanFixture();
  template.meshes[0].skinIndices.fill(7);
  const original = structuredClone(template);
  const base = sourceSurface(template, bvhFixture(0), sha),
    raised = sourceSurface(template, text, sha);
  expect(raised.body.children[0].uuid).not.toBe(base.body.children[0].uuid);
  const projected = sourceSurface(template, text, sha, {
    version: "candidate-camera-v2",
    source_bvh_sha256: sha,
    rotation: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    projection: "perspective",
    distance_torso: 5,
  });
  expect(projected.camera.projection).toBe("perspective");
  expect(projected.camera.projectionMatrix.every(Number.isFinite)).toBe(true);
  projected.dispose();
  expect(template).toEqual(original);
  base.dispose();
  raised.dispose();
  expect(readBatch(batch, identities(batch)).candidates[0].validationReceipt?.skinSafe).toBe(false);
});
