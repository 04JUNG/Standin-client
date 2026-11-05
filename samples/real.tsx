/* eslint-disable react-refresh/only-export-components -- local QA entry, excluded from production */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { assetSchema } from "@/features/pose-viewer/interactive/contract";
import { measurements } from "@/features/pose-viewer/interactive/metrics";
import { rendererResources } from "@/features/pose-viewer/interactive/renderer";
import { assetResources } from "@/features/pose-viewer/interactive/assets";
import "@/app/styles/index.css";
const query = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const nativeFetch = window.fetch.bind(window);
const assets = (
  (await (await nativeFetch("/samples/.local-real/top5-assets.private.json")).json()) as unknown[]
).map((raw) =>
  assetSchema.parse({
    ...(raw as object),
    url: `/v1/local-real-assets/${(raw as { sha256: string }).sha256}`,
  }),
);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  const match = /^\/v1\/local-real-assets\/([a-f0-9]{64})$/.exec(url.pathname);
  if (match && assets.some((a) => a.sha256 === match[1]))
    return nativeFetch(`/samples/.local-real/${match[1]}.glb`, init);
  if (url.origin === location.origin && !url.pathname.startsWith("/v1/"))
    return nativeFetch(input, init);
  return new Response(JSON.stringify({ error: { code: "LOCAL_RECORDED_REPLAY" } }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
};
const result: AnalysisResult = {
  jobId: "job_local_recorded_replay",
  source: "image",
  inputPreviewUrl: "",
  people: [
    {
      index: 0,
      box: [0, 0, 360, 480],
      candidates: assets.map((asset, i) => ({
        id: `recorded-${i + 1}`,
        poseId: `recorded-${i + 1}`,
        rank: i + 1,
        title: `포즈 ${i + 1}`,
        tags: [],
        matchLevel: i < 2 ? "high" : "medium",
        thumbnailUrl: "",
        sourceBvhSha256: asset.sourceSha256,
        previewImages: [],
        bvhAvailable: true,
        interactivePreview: { version: "interactive-preview-v1", asset },
      })),
      confidence: "high",
      skeletonState: "valid",
      skeletonSource: "full_image",
      coverageClass: "full",
      fallbackMode: "none",
      refineAllowed: false,
      refinableLimbs: [],
    },
  ],
  capabilities: { refine: false, fbxExport: false, characterSelection: false, modelPreview: false },
};
query.setQueryData(poseQueryKeys.result(result.jobId), result);
usePoseSelectionStore.getState().startJob(result.jobId, null);
const RealComparison = React.lazy(() => import("./realComparison"));
function Sample() {
  const [report, setReport] = useState("");
  const navigate = useNavigate(),
    { pathname } = useLocation();
  return (
    <div className="flex h-screen flex-col">
      <div className="relative z-[70] flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface-0 px-4 text-xs">
        <span>실제 승인 모델 · 기록된 분석 후보 재생</span>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/app/jobs/${result.jobId}`)}>앱 화면</button>
          <button onClick={() => navigate("/bar/candidates")}>플로팅 바</button>
          <button onClick={() => navigate("/compare")}>리파인·손 대조</button>
          <button
            onClick={() =>
              setReport(
                JSON.stringify(
                  {
                    measurements: measurements(),
                    renderer: rendererResources(),
                    assets: assetResources(),
                  },
                  null,
                  2,
                ),
              )
            }
          >
            측정 기록
          </button>
        </div>
      </div>
      <div
        className={pathname.startsWith("/bar") ? "min-h-0" : "min-h-0 flex-1"}
        style={
          pathname.startsWith("/bar")
            ? { width: 720, height: 560, margin: "20px auto", flexShrink: 0 }
            : undefined
        }
      >
        <Routes>
          <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
          <Route path="/bar/candidates" element={<BarCandidatesPage />} />
          <Route
            path="/compare"
            element={
              <React.Suspense fallback={<p className="p-8">검증된 실제 상태를 읽는 중…</p>}>
                <RealComparison />
              </React.Suspense>
            }
          />
        </Routes>
      </div>
      {report && (
        <div
          style={{
            position: "fixed",
            inset: 60,
            zIndex: 200,
            background: "white",
            overflow: "auto",
            padding: 24,
            border: "1px solid #ddd",
          }}
        >
          <button onClick={() => setReport("")}>기록 닫기</button>
          <pre data-ui-measurements>{report}</pre>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={query}>
    <MemoryRouter initialEntries={[`/app/jobs/${result.jobId}`]}>
      <Sample />
    </MemoryRouter>
  </QueryClientProvider>,
);
