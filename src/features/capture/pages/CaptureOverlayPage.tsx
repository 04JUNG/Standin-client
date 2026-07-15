import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCaptureStore } from "../store/captureStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { cropFrameToFile, scaleSelectionToFrame } from "../lib/cropFrame";
import { createUploadDraft } from "@/features/upload/lib/createUploadDraft";
import { setOverlayFullscreen } from "../lib/overlayWindow";

type Rect = { x: number; y: number; w: number; h: number };

const MIN_SELECTION = 8; // CSS px 미만은 클릭으로 간주

/**
 * 화면 캡처 오버레이(docs/07 §3, ADR-003).
 * 프리즈 프레임 위에서 영역을 드래그해 선택하고, 크롭 결과를 업로드 초안으로 만든다.
 * Escape로 취소(정상 복귀). 실제 픽셀 캡처는 Rust, 선택·크롭은 여기서 담당.
 */
export function CaptureOverlayPage() {
  const navigate = useNavigate();
  const frame = useCaptureStore((s) => s.frame);
  const resetCapture = useCaptureStore((s) => s.reset);
  const setDraft = useUploadStore((s) => s.setDraft);

  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const [processing, setProcessing] = useState(false);

  // 오버레이 동안 전체화면(Tauri). 언마운트 시 해제.
  // frame은 여기서 비우지 않는다: 성공 경로에서 즉시 비우면 `if (!frame)` 가드가
  // 홈으로 리다이렉트하는 레이스가 생기고, StrictMode의 setup→cleanup→setup
  // 이중 호출에서도 frame이 지워져 가드가 발동한다. 다음 캡처가 frame을 덮어쓴다.
  useEffect(() => {
    void setOverlayFullscreen(true);
    return () => {
      void setOverlayFullscreen(false);
    };
  }, []);

  // Escape 취소(정상 복귀).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        resetCapture();
        navigate("/app/home", { replace: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, resetCapture]);

  // 프레임이 없으면(직접 진입·새로고침) 홈으로.
  if (!frame) return <Navigate to="/app/home" replace />;

  function localPoint(e: PointerEvent) {
    const r = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (processing) return;
    const p = localPoint(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: PointerEvent) {
    const start = startRef.current;
    if (!start) return;
    const p = localPoint(e);
    setSel({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  async function onPointerUp() {
    const start = startRef.current;
    startRef.current = null;
    if (!start || !sel) return;

    if (sel.w < MIN_SELECTION || sel.h < MIN_SELECTION) {
      setSel(null);
      return;
    }

    setProcessing(true);
    try {
      const rect = containerRef.current!.getBoundingClientRect();
      const cropRect = scaleSelectionToFrame(
        sel,
        { width: rect.width, height: rect.height },
        { width: frame!.width, height: frame!.height },
      );
      const { file, width, height } = await cropFrameToFile(frame!.dataUrl, cropRect);
      const draft = createUploadDraft(file, { width, height }, "capture");
      setDraft(draft);
      // frame 정리는 언마운트 cleanup이 담당한다(위 useEffect 참고).
      navigate("/app/preview", { replace: true });
    } catch {
      setProcessing(false);
      setSel(null);
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="fixed inset-0 z-50 cursor-crosshair select-none overflow-hidden bg-black"
    >
      <img
        src={frame.dataUrl}
        alt="화면 캡처 프레임"
        draggable={false}
        className="pointer-events-none h-full w-full object-fill"
      />

      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-brand-ink/90 px-4 py-2 text-[13px] text-white">
        드래그로 영역을 선택하세요 · Esc 취소
      </div>

      {sel && sel.w > 0 && sel.h > 0 && (
        <div
          className="pointer-events-none absolute border-2 border-brand-sky"
          style={{
            left: sel.x,
            top: sel.y,
            width: sel.w,
            height: sel.h,
            boxShadow: "0 0 0 9999px rgba(21,34,56,0.45)",
          }}
        />
      )}

      {processing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-8 w-8 animate-spin text-white" aria-label="처리 중" />
        </div>
      )}
    </div>
  );
}
