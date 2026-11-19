// DEV-only browser proof: real BFF HTTP stream; synthetic upstream explicitly labelled.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PoseSearchPending } from "@/features/pose-viewer/components/PoseSearchPending";
import { SelectedRefineStatus } from "@/features/pose-viewer/components/SelectedRefineStatus";
import { refineHttp } from "@/features/pose-viewer/api/refine.http";
import {
  refineResultStatus,
  type SelectedRefineProgress,
} from "@/features/pose-viewer/lib/selectedRefineProgress";
import { env } from "@/shared/lib/env";
import { previewCandidates } from "./analysis-progress-fixture";
import "@/app/styles/index.css";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(new URL(env.apiBaseUrl).hostname))
  throw Error("Wire QA is loopback-only");
export function SelectedRefineWireQA() {
  const [entry, setEntry] = useState<SelectedRefineProgress>();
  const [busy, setBusy] = useState(false);
  const [compact, setCompact] = useState(false);
  const [controller, setController] = useState<AbortController>();
  const [events, setEvents] = useState<string[]>([]);
  const record = (value: string) => setEvents((previous) => [...previous, value]);
  const start = async () => {
    const identity = { jobId: "qa_job", personIndex: 0, candidateId: "qa-pose" };
    const abort = new AbortController();
    setController(abort);
    setBusy(true);
    setEvents([]);
    setEntry({ ...identity, status: "requested", enteredAt: Date.now() });
    try {
      const outcome = await refineHttp.refineSelection({
        ...identity,
        signal: abort.signal,
        onProgress: (phase) => {
          record(`BFF HTTP → ${phase}`);
          setEntry({ ...identity, status: phase, enteredAt: Date.now() });
        },
      });
      record(`BFF HTTP → refined=${outcome.refined}, reason=${outcome.reasonCode}`);
      setEntry({ ...identity, status: refineResultStatus(outcome), enteredAt: Date.now() });
    } catch {
      record(abort.signal.aborted ? "사용자 취소 · 완료 표시 없음" : "HTTP 실패 · 원본 유지");
      setEntry({
        ...identity,
        status: abort.signal.aborted ? "cancelled" : "failed",
        enteredAt: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[960px] p-8">
      <h1 className="text-xl font-semibold">선택 후 리파인 · 로컬 BFF HTTP 검증</h1>
      <p className="my-3 text-sm">
        실제 Hono 라우트·runRefine 진행 스트림과 수정 UI를 연결합니다. 소유권·저장·추론 응답은 통제
        fixture이며 실제 추론 엔진·운영 실행 화면이 아닙니다.
      </p>
      <div className="my-5 flex gap-4 text-sm">
        <button disabled={busy} onClick={() => void start()}>
          선택한 포즈 조정 요청
        </button>
        <button
          disabled={!busy}
          onClick={() => void fetch(`${env.apiBaseUrl}/qa/finish`, { method: "POST" })}
        >
          추론 fixture: 원본 유지 응답
        </button>
        <button
          disabled={!busy}
          onClick={() => void fetch(`${env.apiBaseUrl}/qa/finish?fail=1`, { method: "POST" })}
        >
          추론 fixture: 실패 응답
        </button>
        <button disabled={!busy} onClick={() => controller?.abort()}>
          사용자 취소
        </button>
        <label>
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />{" "}
          플로팅바
        </label>
      </div>
      <div className={compact ? "w-[360px]" : "w-full"}>
        <PoseSearchPending
          mode="refine"
          refinement={entry}
          compact={compact}
          selectionPreviewUrl={previewCandidates[0].thumbnailUrl}
        />
      </div>
      <SelectedRefineStatus progress={entry ? [entry] : []} />
      <pre className="my-5 text-xs" aria-label="실제 HTTP 수신 기록">
        {events.join("\n")}
      </pre>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<SelectedRefineWireQA />);
