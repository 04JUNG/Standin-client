import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/shared/components/Modal";
import "./compactPoseLayout.css";
import { CompactPoseContext } from "./compactPoseContext";

/** Only the floating candidate surface opts in. Desktop cards keep their own sizing. */

export function CompactPoseLayout({ children }: { children: ReactNode }) {
  return (
    <CompactPoseContext.Provider value={true}>
      <div className="compact-pose-layout">{children}</div>
    </CompactPoseContext.Provider>
  );
}

/** Enlargement reuses the displayed poster. It never requests a new model or body render. */
export function CompactPoseImage({ src, alt }: { src: string; alt: string }) {
  const [openedSource, setOpenedSource] = useState<string | null>(null);
  const open = openedSource === src;
  useEffect(() => setOpenedSource(null), [src]);
  // Close this image before the bar's Escape shortcut can collapse the candidate view.
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpenedSource(null);
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="compact-pose-image"
        aria-label={`${alt} 이미지 확대`}
        aria-haspopup="dialog"
        onClick={() => setOpenedSource(src)}
      >
        <img src={src} alt={alt} />
        <span>이미지 확대</span>
      </button>
      <Modal open={open} onClose={() => setOpenedSource(null)} title={alt} width="md">
        <img src={src} alt={`${alt} 확대`} className="max-h-[62vh] w-full object-contain" />
        <p className="mt-2 text-xs text-text-secondary">
          같은 포즈 이미지를 크게 표시합니다. 체형·손·출력 결과는 저장 전 확인하세요.
        </p>
      </Modal>
    </>
  );
}
