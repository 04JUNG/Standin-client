import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUploadStore } from "../store/uploadStore";
import { validateImageFile } from "../lib/validateImage";
import { createUploadDraft } from "../lib/createUploadDraft";

/**
 * File을 받아 검증 → UploadDraft 생성 → store 저장 → 미리보기로 이동.
 * 검증 오류는 화면에 표시할 수 있도록 반환한다(toast 아님, docs/04 §11).
 */
export function useImageInput() {
  const navigate = useNavigate();
  const setDraft = useUploadStore((s) => s.setDraft);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const acceptFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);
      try {
        const result = await validateImageFile(file);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        const draft = createUploadDraft(file, {
          width: result.width,
          height: result.height,
        });
        setDraft(draft);
        navigate("/app/preview");
      } finally {
        setIsProcessing(false);
      }
    },
    [navigate, setDraft],
  );

  return { acceptFile, error, isProcessing, clearError: () => setError(null) };
}
