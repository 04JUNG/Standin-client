// Local-only sample: actual product pages, synthetic ranking, optional local saved posters.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { setInstallationCredentials } from "@/shared/api/client";
import { toAnalysisResult } from "@/features/pose-viewer/api/pose.http";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import "@/app/styles/index.css";
import { rawPage, jobId, snapshotId, sourceSha } from "./progressiveFixture";
const params = new URLSearchParams(location.search),
  legacy = params.has("legacy");
const originalFetch = window.fetch.bind(window);
const stats = {
  posters: 0,
  pages: 0,
  active: 0,
  peak: 0,
  initialCandidates: legacy ? 1000 : 20,
  failNext: false,
  delay: 80,
};
Object.assign(window, { sampleStats: stats });
const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  if (url.pathname.endsWith("/capabilities"))
    return Response.json({
      available: true,
      maxQueryLength: 500,
      maxTopK: 20,
      supportsAllResults: true,
      supportsProgressiveResults: !legacy,
    });
  if (url.pathname.endsWith("/selections")) return Response.json({ selections: [] });
  if (url.pathname.endsWith("/pages")) {
    stats.pages++;
    await wait(stats.delay, init?.signal);
    if (stats.failNext) {
      stats.failNext = false;
      return Response.json({ error: { code: "TEMPORARY", message: "retry" } }, { status: 503 });
    }
    const offset = Number(url.searchParams.get("cursor")?.split(".").at(-1));
    return Response.json(rawPage(offset, Math.min(offset + 20, 1000)));
  }
  if (url.pathname.endsWith("/poster")) {
    stats.posters++;
    stats.peak = Math.max(stats.peak, ++stats.active);
    try {
      await wait(stats.delay, init?.signal);
      const rank = parseInt(url.pathname.split("/").at(-3)!.slice(8), 16);
      const response = await originalFetch(`/samples/local/poster-${rank % 10}.png`);
      if (!response.ok) return new Response(null, { status: 404 });
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/png",
          "X-Standin-Poster-Kind": "default-body",
          "X-Standin-Source-BVH-SHA256": sourceSha,
          "X-Standin-Poster-Version": "default-body-poster-v1",
          "X-Standin-Output-Scope": "full",
          "X-Standin-Preview-Projection": "orthographic",
          "X-Standin-Preview-Only": "true",
          "X-Standin-Preview-Revision": sourceSha,
          "X-Standin-Character-Id": "standin-master-v2",
          "X-Standin-Character-SHA256": sourceSha,
          "X-Standin-Artifact-SHA256": digest,
        },
      });
    } finally {
      stats.active--;
    }
  }
  if (url.pathname.endsWith("/result"))
    return Response.json(rawPage(0, legacy ? 1000 : 20, legacy));
  return Response.json({ items: [], selections: [] });
};
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
useInstallationStore.setState({
  status: "registered",
  credentials: {
    installationId: "sample-owner",
    deviceToken: "sample-device",
    consentVersion: "sample",
  },
});
setInstallationCredentials({ installationId: "sample-owner", deviceToken: "sample-device" });
usePoseSelectionStore.getState().startJob(jobId, null);
qc.setQueryData(
  poseQueryKeys.result(jobId),
  await toAnalysisResult(rawPage(0, legacy ? 1000 : 20, legacy), new AbortController().signal),
);
Object.assign(window, {
  sampleSelection: usePoseSelectionStore,
  sampleQuery: qc,
  sampleJob: jobId,
  sampleSnapshot: snapshotId,
});
const bar = params.has("bar");
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[bar ? "/bar/candidates" : `/app/jobs/${jobId}`]}>
      <Routes>
        <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
        <Route path="/bar/candidates" element={<BarCandidatesPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
