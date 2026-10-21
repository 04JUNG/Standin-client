import {
  useIsFetching,
  useIsMutating,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCaptureStore } from "@/features/capture/store/captureStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useWorkActivityStore } from "@/shared/stores/workActivityStore";

const workQueries = (key: readonly unknown[]) =>
  ["analysis", "body", "refine", "framed"].includes(String(key[0]));

export function updateBlockReason(client: QueryClient): string | null {
  if (
    useWorkActivityStore.getState().count > 0 ||
    client.isFetching({ predicate: (q) => workQueries(q.queryKey) }) > 0 ||
    client.isMutating() > 0
  ) {
    return "분석이나 보정이 진행 중입니다. 작업이 끝난 뒤 업데이트할 수 있습니다.";
  }
  if (["grabbing", "selecting", "processing"].includes(useCaptureStore.getState().status)) {
    return "화면 캡처가 진행 중입니다. 캡처를 마친 뒤 업데이트할 수 있습니다.";
  }
  const exported = useExportStore.getState();
  if (["preparing", "awaiting-confirm"].includes(exported.status))
    return "저장할 장면을 준비·확인 중입니다. 저장하거나 취소한 뒤 업데이트할 수 있습니다.";
  if (exported.status === "saving") return "파일을 저장 중입니다. 저장 후 업데이트할 수 있습니다.";
  const selection = usePoseSelectionStore.getState();
  if (useUploadStore.getState().draft || Object.keys(selection.selectedByPerson).length > 0) {
    // "saved" may refer to older selections of the same job. New Scene explicitly
    // ends that working session; don't infer that the current selection was saved.
    return exported.status === "saved"
      ? "작업을 마친 뒤 저장 화면에서 ‘새 장면’을 눌러 주세요. 그다음 업데이트할 수 있습니다."
      : "저장하지 않은 작업이 있습니다. 작업을 저장하거나 종료한 뒤 업데이트해 주세요.";
  }
  return null;
}

export function useUpdateBlockReason() {
  const client = useQueryClient();
  useIsFetching({ predicate: (q) => workQueries(q.queryKey) });
  useIsMutating();
  useCaptureStore((s) => s.status);
  useUploadStore((s) => s.draft);
  useExportStore();
  usePoseSelectionStore();
  useWorkActivityStore((s) => s.count);
  return { reason: updateBlockReason(client), readReason: () => updateBlockReason(client) };
}
