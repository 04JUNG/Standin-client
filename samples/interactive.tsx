/* eslint-disable react-refresh/only-export-components -- standalone development harness, excluded from production entry */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { fixtureResult, models } from "./fixture";
import { measurements } from "@/features/pose-viewer/interactive/metrics";
import { rendererResources } from "@/features/pose-viewer/interactive/renderer";
import { assetResources } from "@/features/pose-viewer/interactive/assets";
import "@/app/styles/index.css";
const query = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  const data = models.get(url.pathname);
  if (data) {
    await new Promise((r) => setTimeout(r, 35));
    return new Response(data.slice(0), {
      headers: { "Content-Type": "model/gltf-binary", "Content-Length": String(data.byteLength) },
    });
  }
  if (url.origin === location.origin && !url.pathname.startsWith("/v1/"))
    return nativeFetch(input, init);
  // This sample never connects to production, inference, analytics or native storage.
  return new Response(
    JSON.stringify({ error: { code: "UI_SAMPLE_ONLY", message: "화면 검수용 견본입니다." } }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
};
const result = await fixtureResult(true);
query.setQueryData(poseQueryKeys.result(result.jobId), result);
usePoseSelectionStore.getState().startJob(result.jobId, null);
function Controls() {
  const [report, setReport] = useState("");
  const navigate = useNavigate(),
    { pathname } = useLocation();
  return (
    <div className="relative z-[70] flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface-0 px-4 text-xs">
      <span>화면 검수용 견본 · 실제 검색·저장 연결 전</span>
      <div className="flex gap-3">
        <button
          onClick={() =>
            navigate(pathname.startsWith("/bar") ? `/app/jobs/${result.jobId}` : "/bar/candidates")
          }
        >
          {pathname.startsWith("/bar") ? "앱 화면" : "플로팅 바"}
        </button>
        <button
          onClick={() => {
            const value = {
              measurements: measurements(),
              renderer: rendererResources(),
              assets: assetResources(),
              userAgent: navigator.userAgent,
            };
            setReport(JSON.stringify(value, null, 2));
          }}
        >
          측정 기록
        </button>
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
function Sample() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen flex-col">
      <Controls />
      <div
        style={
          pathname.startsWith("/bar")
            ? { width: 720, height: 560, margin: "20px auto", flexShrink: 0 }
            : undefined
        }
        className={pathname.startsWith("/bar") ? "min-h-0" : "min-h-0 flex-1"}
      >
        <Routes>
          <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
          <Route path="/bar/candidates" element={<BarCandidatesPage />} />
          <Route
            path="*"
            element={<div className="p-8">이 견본에서는 후보 비교 화면을 확인할 수 있어요.</div>}
          />
        </Routes>
      </div>
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
