import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { apiFetchResponse } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import type {
  PosePresentation,
  PreviewCandidate,
} from "@/features/pose-viewer/api/posePresentation";
import { bodyKeys, getSelection } from "./api";
import type { BodySelection } from "./contract";
import { renderPresentationBody, usePresentationBody } from "./presentation";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getSelection: vi.fn(),
}));
const candidate = {
  candidate_id: "preview_" + "a".repeat(64),
  asset: {
    bvh_sha256: "b".repeat(64),
    preview_bvh_url:
      "/v1/analysis/jobs/job/people/0/pose-previews/preview_" +
      "a".repeat(64) +
      "/" +
      "b".repeat(64),
  },
} as PreviewCandidate;
const p = {
  person_index: 0,
  library_candidates: [candidate],
  review_candidates: [],
  generated_candidates: [],
} as unknown as PosePresentation;
const selection: BodySelection = {
  schemaVersion: "body-selection.v1",
  previewOnly: true,
  personIndex: 0,
  intent: "manual",
  manualCharacterId: "female",
  resolvedSource: "manual",
  resolvedBody: {
    bodyId: "female",
    bodyVersion: "v1",
    assetSha256: "c".repeat(64),
    rigVersion: "rig",
    measurementVersion: "m",
    characterId: "female",
  },
  recommendation: { status: "disabled", body: null, reasonCodes: [] },
  resolutionStatus: "ready",
  selectionRevision: 1,
  shape: { schemaVersion: "body-shape.v1", controls: { height: 168 }, shapeSha256: "d".repeat(64) },
};
async function response(value = selection) {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, value.selectionRevision]);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "X-Standin-Body-Revision": String(value.selectionRevision),
      "X-Standin-Character-SHA256": value.resolvedBody!.assetSha256,
      "X-Standin-Shape-SHA256": value.shape?.shapeSha256 ?? "none",
      "X-Standin-Source-BVH-SHA256": candidate.asset.bvh_sha256,
      "X-Standin-Preview-Projection": "orthographic",
      "X-Standin-Preview-Only": "true",
      "X-Standin-Artifact-SHA256": hash,
    },
  });
}
afterEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({ credentials: null });
});
it("checks body, numeric shape, source, projection and image digest before displaying", async () => {
  vi.mocked(apiFetchResponse).mockImplementation(() => response());
  const signal = new AbortController().signal;
  expect(await renderPresentationBody("job", candidate, selection, signal)).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(apiFetchResponse).toHaveBeenCalledWith(candidate.asset.preview_bvh_url + "/body/1", {
    auth: false,
    signal,
  });
  for (const header of [
    "Body-Revision",
    "Character-SHA256",
    "Shape-SHA256",
    "Source-BVH-SHA256",
    "Preview-Projection",
    "Preview-Only",
    "Artifact-SHA256",
  ]) {
    vi.mocked(apiFetchResponse).mockImplementation(async () => {
      const r = await response();
      r.headers.set("X-Standin-" + header, "wrong");
      return r;
    });
    await expect(renderPresentationBody("job", candidate, selection, signal)).rejects.toThrow();
  }
  await expect(renderPresentationBody("foreign", candidate, selection, signal)).rejects.toThrow();
});
it("hides the previous body immediately and ignores its late response after revision change", async () => {
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "token", consentVersion: "test" },
  });
  vi.mocked(getSelection).mockResolvedValue(selection);
  const finish: ((r: Response) => void)[] = [];
  vi.mocked(apiFetchResponse).mockImplementation(
    () => new Promise((resolve) => finish.push(resolve)),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const { result, unmount } = renderHook(() => usePresentationBody("job", p), { wrapper });
  await waitFor(() => expect(finish).toHaveLength(1));
  await act(async () => finish[0](await response()));
  await waitFor(() => expect(result.current.entry.ready).toBe(true));
  const second = {
    ...selection,
    selectionRevision: 2,
    shape: { ...selection.shape!, shapeSha256: "e".repeat(64), controls: { height: 170 } },
  };
  act(() => qc.setQueryData(bodyKeys.selection("owner", "job", 0), second));
  await waitFor(() => expect(finish).toHaveLength(2));
  expect(result.current.images).toBeUndefined();
  const third = { ...second, selectionRevision: 3 };
  act(() => qc.setQueryData(bodyKeys.selection("owner", "job", 0), third));
  await waitFor(() => expect(finish).toHaveLength(3));
  await act(async () => finish[1](await response(second)));
  expect(result.current.images).toBeUndefined();
  await act(async () => finish[2](await response(third)));
  await waitFor(() => expect(result.current.entry.ready).toBe(true));
  expect(result.current.images?.[candidate.candidate_id]).toContain("data:image/png;base64,");
  expect(result.current.entry.selection?.selectionRevision).toBe(3);
  unmount();
  qc.clear();
});
it("keeps verified Top-5 body images when a generated reference cannot render", async () => {
  useInstallationStore.setState({
    credentials: { installationId: "owner", deviceToken: "token", consentVersion: "test" },
  });
  vi.mocked(getSelection).mockResolvedValue(selection);
  vi.mocked(apiFetchResponse)
    .mockImplementationOnce(() => response())
    .mockRejectedValueOnce(Error("generated render failed"));
  const reference = {
    ...candidate,
    candidate_id: "preview_" + "e".repeat(64),
    asset: {
      ...candidate.asset,
      preview_bvh_url: candidate.asset.preview_bvh_url.replace(
        "preview_" + "a".repeat(64),
        "preview_" + "e".repeat(64),
      ),
    },
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const { result, unmount } = renderHook(
    () => usePresentationBody("job", { ...p, generated_candidates: [reference] }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.entry.error).toBeTruthy());
  expect(result.current.images?.[candidate.candidate_id]).toMatch(/^data:image\/png;base64,/);
  expect(result.current.images?.[reference.candidate_id]).toBeUndefined();
  expect(apiFetchResponse).toHaveBeenCalledTimes(2);
  unmount();
  qc.clear();
});
