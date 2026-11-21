// DEV-only, opt-in HTTP verification. No fixture stages, stored keys, or remote test registrations.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { CONSENT_VERSION, useInstallationStore } from "@/features/installation/installationStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisProgress } from "@/features/pose-viewer/lib/loadingProgress";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { apiFetch, setInstallationCredentials } from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import "@/app/styles/index.css";

if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(new URL(env.apiBaseUrl).hostname))
  throw Error("Live QA requires a local development BFF");
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
type RecordEntry = {
  at: string;
  phase: string;
  snapshot?: AnalysisProgress["snapshot"];
  people?: number;
  candidates?: number[];
  error?: string;
};
function LiveQA() {
  const [ready, setReady] = useState(false);
  const [job, setJob] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [surface, setSurface] = useState("app");
  const [records, setRecords] = useState<RecordEntry[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("standin.local-live-qa.public-events") ?? "[]");
    } catch {
      return [];
    }
  });
  const [error, setError] = useState<string>();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    sessionStorage.setItem("standin.local-live-qa.public-events", JSON.stringify(records));
  }, [records]);
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (!job || event.type !== "updated") return;
        const key = JSON.stringify(event.query.queryKey);
        const at = new Date().toISOString();
        if (key === JSON.stringify(poseQueryKeys.progress(job))) {
          const progress = event.query.state.data as AnalysisProgress | null;
          if (!progress) return;
          const id = `${progress.phase}:${progress.snapshot?.sequence ?? "generic"}`;
          if (seen.current.has(id)) return;
          seen.current.add(id);
          setRecords((rows) => [
            ...rows,
            { at, phase: progress.phase, snapshot: progress.snapshot },
          ]);
        } else if (key === JSON.stringify(poseQueryKeys.result(job))) {
          if (event.query.state.status === "success" && !seen.current.has("completed")) {
            seen.current.add("completed");
            setBusy(false);
            const result = event.query.state.data as AnalysisResult;
            setRecords((rows) => [
              ...rows,
              {
                at,
                phase: "completed",
                people: result.people.length,
                candidates: result.people.map((p) => p.candidates.length),
              },
            ]);
          } else if (event.query.state.status === "error") {
            setBusy(false);
            setError(String(event.query.state.error));
          }
        }
      }),
    [job],
  );
  async function prepare() {
    try {
      const credentials = await apiFetch<{ installationId: string; deviceToken: string }>(
        "/v1/installations",
        {
          method: "POST",
          auth: false,
          installation: false,
          body: {
            consentVersion: CONSENT_VERSION,
            consentedAt: new Date().toISOString(),
            appVersion: import.meta.env.VITE_APP_VERSION,
            osName: "local-qa",
            osVersion: "isolated-test",
            architecture: "arm64",
            locale: "ko-KR",
          },
        },
      );
      const identity = { ...credentials, consentVersion: CONSENT_VERSION };
      setInstallationCredentials(identity);
      useInstallationStore.setState({ status: "registered", credentials: identity, error: null });
      setReady(true);
    } catch (e) {
      setError(String(e));
    }
  }
  async function start(file?: File) {
    if (!file) return;
    setError(undefined);
    setBusy(true);
    setRecords([]);
    seen.current.clear();
    try {
      const previewUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = previewUrl;
      await image.decode();
      const id = crypto.randomUUID();
      useUploadStore.getState().setDraft({
        id,
        source: "file",
        file,
        previewUrl,
        originalName: file.name,
        mimeType: file.type,
        width: image.naturalWidth,
        height: image.naturalHeight,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
      usePoseSelectionStore.getState().startJob(id, null);
      setJob(id);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <>
      <header
        style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
      >
        <b>로컬 BFF · 실제 러프 검증</b>
        <span>실제 API 호출 / 합성 단계 없음</span>
        <button disabled={ready} onClick={() => void prepare()}>
          로컬 테스트 설치 준비
        </button>
        <label>
          실제 러프 선택{" "}
          <input
            aria-label="실제 러프 선택"
            type="file"
            accept="image/png,image/jpeg"
            disabled={!ready || busy}
            onChange={(e) => void start(e.target.files?.[0])}
          />
        </label>
        <label>
          화면{" "}
          <select
            aria-label="검증 화면"
            disabled={busy}
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
          >
            <option value="app">앱</option>
            <option value="bar">플로팅 바</option>
          </select>
        </label>
        <span role="status">{busy ? "실제 분석 중" : ready ? "준비됨" : "테스트 설치 필요"}</span>
      </header>
      {error && <pre role="alert">{error}</pre>}
      {job && (
        <div style={{ height: 800, minWidth: 960, borderBlock: "1px solid var(--border)" }}>
          <QueryClientProvider client={client}>
            <MemoryRouter
              key={`${job}:${surface}`}
              initialEntries={[surface === "app" ? `/app/jobs/${job}` : "/bar/candidates"]}
            >
              <Routes>
                <Route path="/app/jobs/:jobId" element={<PoseViewerPage />} />
                <Route path="/bar/candidates" element={<BarCandidatesPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </div>
      )}
      <details open style={{ padding: 16 }}>
        <summary>실제 수신 기록 ({records.length})</summary>
        <pre id="qa-events" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(records, null, 2)}
        </pre>
      </details>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<LiveQA />);
