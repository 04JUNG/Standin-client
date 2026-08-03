import { Navigate, useNavigate } from "react-router-dom";
import { Trash2, RefreshCw } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { formatBytes } from "@/shared/lib/formatBytes";
import type { UploadSource } from "@/shared/types/upload";
import { useUploadStore } from "../store/uploadStore";
import { trackInputConfirmed } from "@/features/analytics/analyticsClient";

const SOURCE_LABEL: Record<UploadSource, string> = {
  file: "파일 업로드",
  capture: "화면 캡처",
  clipboard: "클립보드",
};

/**
 * 입력 미리보기 화면(docs/03 §5, docs/07 §10).
 * 회전·크롭은 이번 주 제외(자리 없음). 분석 시작은 Mock jobId로 포즈 후보 뷰어로 이동한다(docs/12).
 */
export function InputPreviewPage() {
  const navigate = useNavigate();
  const draft = useUploadStore((s) => s.draft);
  const clearDraft = useUploadStore((s) => s.clearDraft);
  const bindings = useShortcutStore((s) => s.bindings);

  // 가드보다 먼저 호출해 hook 순서를 고정한다(초안 없음 → 조기 반환).
  useShortcuts({
    "inputPreview.startAnalysis": () => startAnalysis(),
    "inputPreview.discard": () => discardAndHome(),
  });

  // 초안이 없으면(새로고침·직접 진입) 홈으로.
  if (!draft) return <Navigate to="/app/home" replace />;

  function discardAndHome() {
    clearDraft();
    navigate("/app/home", { replace: true });
  }

  function startAnalysis() {
    trackInputConfirmed(draft!);
    // 실제 분석 Job 생성은 서버 연동 후속 브랜치. 지금은 Mock 포즈 후보 뷰어로 바로 이동한다(docs/12).
    navigate(`/app/jobs/${crypto.randomUUID()}`);
  }

  return (
    <AppShell title="입력 미리보기">
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 lg:flex-row">
        <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-brand-paper p-4">
          <img
            src={draft.previewUrl}
            alt={draft.originalName}
            className="max-h-[60vh] max-w-full rounded object-contain"
          />
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[300px]">
          <div className="rounded-xl border border-border bg-surface-0 p-4">
            <dl className="flex flex-col gap-3 text-[13px]">
              <Row label="출처" value={SOURCE_LABEL[draft.source]} />
              <Row label="파일명" value={draft.originalName} title />
              <Row label="크기" value={`${draft.width} × ${draft.height} px`} />
              {draft.sizeBytes !== undefined && (
                <Row label="용량" value={formatBytes(draft.sizeBytes)} />
              )}
            </dl>
          </div>

          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={startAnalysis}>
              분석 시작
              <ShortcutKey
                accelerator={resolveAccelerator("inputPreview.startAnalysis", bindings)!}
                className="ml-1"
              />
            </Button>
            <Button variant="secondary" size="md" onClick={discardAndHome}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              다시 선택
            </Button>
            <Button variant="ghost" size="md" onClick={discardAndHome}>
              <Trash2 className="h-4 w-4" aria-hidden />
              삭제
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd
        className={title ? "truncate text-right text-text-primary" : "text-right text-text-primary"}
        title={title ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
