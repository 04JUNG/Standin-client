import { Navigate, useNavigate } from "react-router-dom";
import { ImageOff, Loader2, Save } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { useSelectionReview } from "@/features/pose-viewer/hooks/useSelectionReview";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { BarShell } from "../components/BarShell";

/**
 * 바 모드의 저장 전 확인(ADR-010). 앱 모드 ReviewPage와 같은 훅을 쓰고 레이아웃만 다르다.
 *
 * 바는 높이가 좁아 카드도 설명도 못 넣는다. 대신 그림만 한 줄로 늘어놓는다 — 확인 화면이
 * 답해야 하는 질문은 "무엇이 저장되는가" 하나이고, 거기에는 그림이면 충분하다.
 */
export function BarReviewPage() {
  const navigate = useNavigate();
  const jobId = usePoseSelectionStore((s) => s.jobId);
  const { items, isRefining } = useSelectionReview(jobId ?? undefined);

  if (!jobId) return <Navigate to="/bar/actions" replace />;
  if (!isRefining && items.length === 0) return <Navigate to="/bar/candidates" replace />;

  return (
    <BarShell title="저장할 포즈 확인">
      <div className="flex h-full flex-col gap-2 p-2.5">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-text-secondary">
          {isRefining ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="text-[12px]">포즈를 조정하는 중…</span>
            </>
          ) : (
            <ul className="flex w-full min-w-0 items-center justify-center gap-1.5 overflow-x-auto">
              {items.map((item) => (
                /**
                 * 남는 폭을 나눠 갖되 원본(256px)을 넘겨 늘리지 않는다. 인물이 많아
                 * 80px 아래로 내려가면 더 줄이지 않고 가로로 넘긴다 — 그보다 작으면
                 * 어떤 포즈인지 알아볼 수 없어 확인 화면의 뜻이 사라진다.
                 */
                <li key={item.personIndex} className="min-w-[80px] max-w-[128px] flex-1 basis-0">
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={`인물 ${item.personIndex + 1}에 저장될 포즈`}
                      title={`인물 ${item.personIndex + 1} · ${item.candidate.title}`}
                      className="aspect-square w-full rounded border border-border bg-surface-2 object-contain"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded border border-border bg-surface-2">
                      <ImageOff className="h-5 w-5" aria-hidden />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 flex-1"
            onClick={() => navigate("/bar/candidates")}
          >
            다시 고르기
          </Button>
          <Button
            size="sm"
            className="min-w-0 flex-1"
            disabled={isRefining}
            onClick={() => navigate("/bar/save")}
          >
            <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />이 포즈로 저장
          </Button>
        </div>
      </div>
    </BarShell>
  );
}
