import { useRef, useState, type PointerEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { useCaptureStore } from "../store/captureStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { cropFrameToFile, scaleSelectionToFrame } from "../lib/cropFrame";
import { createUploadDraft } from "@/features/upload/lib/createUploadDraft";
import { afterInputRoute, idleRoute } from "@/features/bar/lib/flowOrigin";

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
  const origin = useCaptureStore((s) => s.origin);
  const setDraft = useUploadStore((s) => s.setDraft);

  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const [processing, setProcessing] = useState(false);

  // 전체화면 전환은 WindowModeSync가 라우트에서 파생해 처리한다(ADR-008).
  // frame은 여기서 비우지 않는다: 성공 경로에서 즉시 비우면 `if (!frame)` 가드가
  // 리다이렉트하는 레이스가 생기고, StrictMode의 이중 호출에서도 가드가 발동한다.
  // 다음 캡처가 frame을 덮어쓴다.

  const bindings = useShortcutStore((s) => s.bindings);
  const cancelAccelerator = resolveAccelerator("captureOverlay.cancel", bindings) ?? "Escape";

  // Escape 취소(정상 복귀). 크롭 처리 중에는 취소를 막는다.
  useShortcuts({
    "captureOverlay.cancel": processing
      ? undefined
      : () => {
          resetCapture();
          navigate(idleRoute(origin), { replace: true });
        },
  });

  // 프레임이 없으면(직접 진입·새로고침) 홈으로.
  if (!frame) return <Navigate to={idleRoute(origin)} replace />;

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
      setDraft(draft, origin);
      // 시작한 곳으로 돌아간다 — 바에서 시작했으면 앱 창을 거치지 않는다(ADR-008).
      navigate(afterInputRoute(origin), { replace: true });
    } catch {
      setProcessing(false);
      setSel(null);
    }
  }

  // 드래그 중 선택 영역의 실제 캡처 크기(프레임 물리 픽셀)를 표시.
  function selectionSizeLabel(): string {
    const c = containerRef.current;
    if (!sel || !c) return "";
    const phys = scaleSelectionToFrame(
      sel,
      { width: c.clientWidth, height: c.clientHeight },
      { width: frame!.width, height: frame!.height },
    );
    return `${Math.round(phys.width)} × ${Math.round(phys.height)}`;
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

      <div className="pointer-events-none absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand-ink/90 px-4 py-2 text-[13px] text-white">
        <span>드래그로 영역을 선택하세요</span>
        <span aria-hidden>·</span>
        <ShortcutKey accelerator={cancelAccelerator} />
        <span>취소</span>
      </div>

      {sel && sel.w > 0 && sel.h > 0 && (
        <>
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
          <div
            className="pointer-events-none absolute rounded bg-brand-ink/90 px-2 py-1 text-[11px] font-medium text-white"
            style={{ left: sel.x, top: Math.max(sel.y - 26, 4) }}
          >
            {selectionSizeLabel()}
          </div>
        </>
      )}

      {processing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-8 w-8 animate-spin text-white" aria-label="처리 중" />
        </div>
      )}
    </div>
  );
}
