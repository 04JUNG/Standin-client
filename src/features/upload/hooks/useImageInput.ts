import { ensureInputAttempt, finishInputAttempt } from "@/features/analytics/analyticsClient";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { afterInputRoute, type FlowOrigin } from "@/features/bar/lib/flowOrigin";
import { useUploadStore } from "../store/uploadStore";
import { validateImageFile } from "../lib/validateImage";
import { createUploadDraft } from "../lib/createUploadDraft";
import { beginWork } from "@/shared/stores/workActivityStore";

/**
 * File을 받아 검증 → UploadDraft 생성 → store 저장 → 다음 단계로 이동.
 * 검증 오류는 화면에 표시할 수 있도록 반환한다(toast 아님, docs/04 §11).
 *
 * origin에 따라 목적지가 갈린다 — 앱은 미리보기, 바는 바로 분석(ADR-008).
 */
export function useImageInput(options: { origin?: FlowOrigin } = {}) {
  const { origin = "app" } = options;
  const navigate = useNavigate();
  const setDraft = useUploadStore((s) => s.setDraft);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const acceptFile = useCallback(
    async (file: File) => {
      ensureInputAttempt("file", origin);
      setError(null);
      setIsProcessing(true);
      const finishWork = beginWork();
      try {
        const result = await validateImageFile(file);
        if (!result.ok) {
          finishInputAttempt("file", "failed", "INVALID_IMAGE", { kind: "validation" });
          setError(result.error.message);
          return;
        }
        const draft = createUploadDraft(file, {
          width: result.width,
          height: result.height,
        });
        setDraft(draft, origin);
        navigate(afterInputRoute(origin));
      } catch (error) {
        finishInputAttempt("file", "failed", "INPUT_FAILED", error);
        setError("이미지를 열지 못했어요. 다시 시도해 주세요.");
      } finally {
        finishWork();
        setIsProcessing(false);
      }
    },
    [navigate, origin, setDraft],
  );

  return { acceptFile, error, isProcessing, clearError: () => setError(null) };
}
