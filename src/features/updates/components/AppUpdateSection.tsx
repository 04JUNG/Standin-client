import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { AlertCircle, Check, Download, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { updateService } from "../api/update.service";
import { useUpdateStore } from "../store/updateStore";

/**
 * 설정의 버전·업데이트 섹션(ADR-011).
 *
 * 앱에 버전을 확인할 곳이 없어서 테스터가 자기가 어떤 빌드를 쓰는지 말할 수 없었다.
 * 그래서 버전 표시는 업데이트 피드 유무와 무관하게 항상 나온다.
 *
 * 업데이트 확인 UI는 피드가 설정된 빌드에서만 나온다. 피드가 없는 빌드에서 버튼을
 * 보여주면 누를 때마다 실패하는 기능을 있는 것처럼 보이게 한다(CLAUDE.md §10).
 *
 * 확인 결과는 store에서 온다 — 시작 시 자동 확인(UpdateBanner)과 같은 결과를 봐야
 * 배너를 보고 넘어온 사용자가 같은 버튼을 다시 누르지 않는다. 설치는 여기에만 둔다.
 */

type InstallPhase =
  | { kind: "idle" }
  | { kind: "installing"; ratio: number | null }
  | { kind: "installed" }
  | { kind: "error"; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "업데이트를 설치하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AppUpdateSection() {
  const version = useUpdateStore((s) => s.version);
  const configured = useUpdateStore((s) => s.configured);
  const checkPhase = useUpdateStore((s) => s.phase);
  const result = useUpdateStore((s) => s.result);
  const checkError = useUpdateStore((s) => s.error);
  const loadInfo = useUpdateStore((s) => s.loadInfo);
  const check = useUpdateStore((s) => s.check);

  const [install, setInstall] = useState<InstallPhase>({ kind: "idle" });

  // 분석은 서버에서 오래 도는 작업이라 재시작하면 사용자가 기다린 시간이 날아간다.
  // 처리 중인 작업을 알 수 있어야 한다는 원칙(docs/11 §1)을 재시작에도 적용한다.
  const analysisRunning = useIsFetching({ queryKey: poseQueryKeys.all }) > 0;

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  async function installUpdate() {
    setInstall({ kind: "installing", ratio: null });
    try {
      await updateService.install(({ ratio }) => setInstall({ kind: "installing", ratio }));
      setInstall({ kind: "installed" });
    } catch (error) {
      setInstall({ kind: "error", message: errorMessage(error) });
    }
  }

  const checking = checkPhase === "checking";
  const busy = checking || install.kind === "installing";
  const available = checkPhase === "done" && result?.kind === "available" ? result : null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-text-primary">버전</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          문의할 때 이 버전을 함께 알려주시면 원인을 찾기 쉽습니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] text-text-primary">Standin {version ?? "불러오는 중…"}</p>
            {configured === false && (
              <p className="mt-1 text-[12px] text-text-secondary">
                이 빌드는 자동 업데이트를 사용하지 않습니다. 새 버전은 직접 내려받아 설치해 주세요.
              </p>
            )}
          </div>

          {configured && (
            <Button
              variant="secondary"
              size="md"
              loading={checking}
              disabled={busy}
              onClick={() => void check()}
            >
              {checking ? "확인 중…" : "업데이트 확인"}
            </Button>
          )}
        </div>

        {checkPhase === "done" && result?.kind === "up-to-date" && (
          <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            최신 버전입니다.
          </p>
        )}

        {available && install.kind === "idle" && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[13px] font-semibold text-text-primary">
              새 버전 {available.version}이(가) 있습니다.
            </p>
            {available.notes && (
              <p className="whitespace-pre-line text-[12px] text-text-secondary">
                {available.notes}
              </p>
            )}

            {analysisRunning && (
              // 막지 않고 이유를 말한다. 분석이 끝나면 그대로 누를 수 있다.
              <p className="flex items-start gap-1.5 text-[12px] text-text-secondary">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                분석이 진행 중입니다. 끝난 뒤에 설치하면 결과를 잃지 않습니다.
              </p>
            )}

            <div>
              <Button
                variant="primary"
                size="md"
                disabled={analysisRunning}
                onClick={() => void installUpdate()}
              >
                <Download className="h-4 w-4" aria-hidden />
                지금 설치
              </Button>
            </div>
          </div>
        )}

        {install.kind === "installing" && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              {install.ratio === null
                ? "내려받는 중…"
                : `내려받는 중… ${Math.round(install.ratio * 100)}%`}
            </p>
            <p className="text-[12px] text-text-secondary">설치가 끝날 때까지 앱을 닫지 마세요.</p>
          </div>
        )}

        {install.kind === "installed" && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[13px] text-text-primary">
              설치했습니다. 다시 시작하면 새 버전으로 열립니다.
            </p>
            <div>
              <Button variant="primary" size="md" onClick={() => void updateService.relaunch()}>
                지금 다시 시작
              </Button>
            </div>
          </div>
        )}

        {(checkPhase === "error" || install.kind === "error") && (
          <p role="alert" className="flex items-start gap-1.5 text-[12px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {install.kind === "error" ? install.message : checkError}
          </p>
        )}
      </div>
    </section>
  );
}
