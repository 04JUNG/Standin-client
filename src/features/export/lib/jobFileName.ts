import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import type { UploadDraft } from "@/shared/types/upload";
import type { ExportFormat } from "../store/exportStore";
import { defaultFileName } from "./defaultFileName";

export function jobFileName(
  routeJob: string,
  result: AnalysisResult | undefined,
  draft: UploadDraft | null,
  format: ExportFormat,
) {
  if (result?.source === "semantic") return defaultFileName("문장검색.png", format);
  const original =
    (result?.sourceImage?.identity === `${result?.jobId}:input`
      ? result?.sourceImage?.originalName
      : undefined) ?? (draft?.id === routeJob ? draft.originalName : undefined);
  return defaultFileName(original || `standin_${result?.jobId ?? routeJob}.png`, format);
}
