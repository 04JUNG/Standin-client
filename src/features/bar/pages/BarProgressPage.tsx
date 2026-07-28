import { useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";

/**
 * 바 모드의 분석 진행 상태(ADR-008).
 *
 * 앱 모드는 미리보기 화면에서 사용자가 "분석 시작"을 누르지만, 바는 좁고 빠른 진입이
 * 목적이라 입력을 받자마자 분석에 들어간다("적은 동작으로 캡처·선택").
 *
 * 실제 Job 생성은 서버 연동 후속 작업이라 지금은 jobId만 만들어 후보 화면으로 넘긴다
 * (앱 모드의 InputPreviewPage와 같은 임시 처리).
 */
export function BarProgressPage() {
  const navigate = useNavigate();
  const draft = useUploadStore((s) => s.draft);
  const setJobId = usePoseSelectionStore((s) => s.setJobId);
  const started = useRef(false);

  useEffect(() => {
    if (!draft || started.current) return;
    started.current = true;
    const jobId = crypto.randomUUID();
    setJobId(jobId);
    navigate("/bar/candidates", { replace: true });
  }, [draft, navigate, setJobId]);

  // 초안이 없으면(새로고침·직접 진입) 바 기본 상태로.
  if (!draft) return <Navigate to="/bar/actions" replace />;

  return (
    <BarShell title="분석 중">
      <div className="flex h-full items-center gap-2 px-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-coral" aria-hidden />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-text-primary">
            가까운 포즈 후보를 찾는 중…
          </p>
          <p className="truncate text-[11px] text-text-secondary">{draft.originalName}</p>
        </div>
      </div>
    </BarShell>
  );
}
