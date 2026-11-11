import { useEffect } from "react";
import { AlertCircle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { useUpdateStore } from "../store/updateStore";
import { useUpdateBlockReason } from "../hooks/useUpdateBlockReason";
import { releaseHistory, useReleaseNotesStore } from "../lib/releaseNotes";

export function AppUpdateSection({ required = false }: { required?: boolean }) {
  const state = useUpdateStore();
  const loadInfo = state.loadInfo;
  const { reason, readReason } = useUpdateBlockReason(required);
  const requestHistory = useReleaseNotesStore((s) => s.requestHistory);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  const busy =
    state.phase === "checking" ||
    ["downloading", "installing", "restarting"].includes(state.installPhase);
  const available = state.result?.kind === "available" ? state.result : null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-text-primary">버전 및 업데이트</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          새 버전을 자동으로 내려받고 다음 실행 때 적용합니다.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] text-text-primary">
              Standin {state.version ?? "불러오는 중…"}
            </p>
            {state.configured === false && (
              <p className="mt-1 text-[12px] text-text-secondary">
                이 버전은 자동으로 업데이트되지 않아요. 새 설치 파일을 내려받아 설치해 주세요.
              </p>
            )}
          </div>

          {state.configured && (
            <Button
              variant="secondary"
              size="md"
              loading={state.phase === "checking"}
              disabled={busy}
              onClick={() => void state.check("manual")}
            >
              {state.phase === "checking" ? "확인 중…" : "업데이트 확인"}
            </Button>
          )}
        </div>
        {!required && state.result?.kind === "up-to-date" && (
          <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <Check className="h-3.5 w-3.5" aria-hidden />
            최신 버전입니다.
          </p>
        )}
        {available && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[13px] font-semibold text-text-primary">
              새 버전 {available.version}이(가) 있습니다.
            </p>
            {available.notes && (
              <p className="max-h-48 overflow-y-auto whitespace-pre-line text-[12px] text-text-secondary">
                {available.notes}
              </p>
            )}
          </div>
        )}
        {state.installPhase === "downloading" && (
          <p role="status" className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {state.ratio === null
              ? "백그라운드에서 내려받는 중…"
              : `내려받는 중… ${Math.round(state.ratio * 100)}%`}
          </p>
        )}
        {state.installPhase === "ready" && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-text-primary">
              {state.cached?.attempted
                ? "이전 설치가 완료되지 않았습니다. 다시 시도할 수 있습니다."
                : "다운로드를 마쳤습니다. 다음 실행 시 자동 업데이트됩니다."}
            </p>
            {reason && <p className="text-[12px] text-text-secondary">{reason}</p>}
            <div>
              <Button
                variant="primary"
                size="md"
                disabled={Boolean(reason) || busy}
                onClick={() => void state.install(readReason)}
              >
                지금 업데이트
              </Button>
            </div>
          </div>
        )}
        {state.error && (
          <p role="alert" className="flex items-start gap-1.5 text-[12px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}
        {state.version && releaseHistory(state.version).length > 0 && (
          <div>
            <Button variant="ghost" size="md" onClick={requestHistory}>
              변경 내역 보기
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
