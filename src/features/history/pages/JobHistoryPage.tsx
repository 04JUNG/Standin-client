import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Loader2 } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { toAppError } from "@/shared/api/errors";
import type { JobHistoryItem } from "../api/history.contract";
import { JobHistoryRow } from "../components/JobHistoryRow";
import { useDeleteJob } from "../hooks/useDeleteJob";
import { useJobHistory } from "../hooks/useJobHistory";
import { formatJobDate } from "../lib/formatJobDate";

/**
 * 작업 기록(docs/09 §5).
 *
 * 서버가 단일 진실 공급원이다. 로컬 캐시를 두지 않으므로 오프라인에서는 목록이 비는
 * 것이 아니라 오류와 재시도를 보여준다 — 빈 목록으로 보이면 "작업이 지워졌다"로 읽힌다.
 */
export function JobHistoryPage() {
  const navigate = useNavigate();
  const { items, isPending, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useJobHistory();
  const deleteJob = useDeleteJob();
  const [pendingDelete, setPendingDelete] = useState<JobHistoryItem | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteJob.mutate(pendingDelete.jobId, { onSettled: () => setPendingDelete(null) });
  }

  return (
    <AppShell title="작업 기록">
      {isPending ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-sky" aria-hidden />
          <span className="sr-only">작업 기록을 불러오는 중</span>
        </div>
      ) : isError ? (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-[14px] text-text-secondary">{toAppError(error).message}</p>
          <Button variant="secondary" size="md" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <History className="h-8 w-8 text-text-secondary" aria-hidden />
          <p className="text-[14px] text-text-secondary">아직 분석한 작업이 없습니다.</p>
          <Button variant="primary" size="md" onClick={() => navigate("/app/home")}>
            새 분석 시작
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <JobHistoryRow
                key={item.jobId}
                item={item}
                // 기록 상세는 **서버 jobId를 라우트 jobId로 그대로** 쓴다. 라우트를 나누지
                // 않은 덕분에 선택 상태·저장 흐름·바 모드 전환이 그대로 성립한다(ADR-012).
                onOpen={(jobId) => navigate(`/app/jobs/${jobId}`)}
                onRequestDelete={setPendingDelete}
                isDeleting={deleteJob.isPending && deleteJob.variables === item.jobId}
              />
            ))}
          </ul>

          {hasNextPage && (
            <div className="flex justify-center">
              {/* 무한 스크롤이 아니라 버튼이다 — 관측자를 앱 셸의 스크롤 컨테이너에
                  붙이는 배관이 필요 없고, 사용자가 목록 끝을 스스로 정한다. */}
              <Button
                variant="secondary"
                size="md"
                loading={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                더 보기
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="이 작업을 삭제할까요?"
        description={
          pendingDelete
            ? `${formatJobDate(pendingDelete.createdAt)} 작업의 원본 이미지와 분석 결과가 서버에서 지워지며 되돌릴 수 없습니다.`
            : ""
        }
        confirmLabel="삭제"
        destructive
        loading={deleteJob.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}
