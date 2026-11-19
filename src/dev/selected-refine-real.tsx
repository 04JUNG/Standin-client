import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PoseSearchPending } from "@/features/pose-viewer/components/PoseSearchPending";
import { refineHttp } from "@/features/pose-viewer/api/refine.http";
import {
  refineResultStatus,
  type SelectedRefineProgress,
} from "@/features/pose-viewer/lib/selectedRefineProgress";
import { env } from "@/shared/lib/env";
import "@/app/styles/index.css";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(new URL(env.apiBaseUrl).hostname))
  throw Error("real QA is loopback-only");
type Input = {
  jobId: string;
  personIndex: number;
  candidateId: string;
  poseId: string;
  roughUrl: string;
  fileName: string;
  coordinateSource: string;
};
export function RealRefineQA() {
  const [input, setInput] = useState<Input>();
  const [entry, setEntry] = useState<SelectedRefineProgress>();
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(`${env.apiBaseUrl}/qa/input`)
      .then((r) => r.json())
      .then(setInput);
  }, []);
  const start = async () => {
    if (!input) return;
    setBusy(true);
    setEvents([]);
    setEntry({ ...input, status: "requested", enteredAt: Date.now() });
    try {
      const result = await refineHttp.refineSelection({
        ...input,
        onProgress: (phase, target) => {
          setEntry({ ...input, status: phase, enteredAt: Date.now(), target });
          setEvents((es) => [
            ...es,
            `${Date.now()} ${phase}; joints=${target?.targetJoints.join(",") ?? "none"}`,
          ]);
        },
      });
      setEntry({ ...input, status: refineResultStatus(result), enteredAt: Date.now() });
      setEvents((es) => [
        ...es,
        `actual result: refined=${result.refined}; reason=${result.reasonCode}`,
      ]);
    } catch (e) {
      setEntry({ ...input, status: "failed", enteredAt: Date.now() });
      setEvents((es) => [...es, String(e)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[960px] p-8">
      <h1 className="text-xl font-semibold">실제 RTMPose 추출 → 실제 로컬 리파인</h1>
      <p className="my-3 text-sm">
        수동 관절 없음 · 실제 v2.5 엔진 실행 · 라우팅 제어값과 소유권/저장은 로컬 검증용입니다.
      </p>
      <button
        className="my-3 rounded border p-3"
        disabled={!input || busy}
        onClick={() => void start()}
      >
        실제 리파인 실행
      </button>
      <div className="real-refine-capture">
        <PoseSearchPending
          mode="refine"
          preview={input ? { previewUrl: input.roughUrl, originalName: "001.png" } : null}
          refinement={entry}
        />
      </div>
      <pre aria-label="실제 실행 기록" className="my-5 text-xs whitespace-pre-wrap">
        {events.join("\n")}
      </pre>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<RealRefineQA />);
