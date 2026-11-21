import { useInstallationStore } from "@/features/installation/installationStore";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { candidateReferenceUrl } from "../api/candidatePoster";
import { SelectionPreview } from "./SelectionPreview";
import { PreviewContext, useCandidatePreview } from "./candidatePreviewAction";

type PreviewProps = ComponentProps<typeof SelectionPreview>;

/** Read-only inspection never updates the selected candidate or confirms a body. */
export function CandidatePreviewProvider({
  children,
  ...preview
}: PreviewProps & { children: ReactNode }) {
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [candidateId, setCandidateId] = useState<string>();
  const dialog = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const presentation = preview.person.posePresentation;
  const rows = presentation
    ? [
        ...presentation.library_candidates,
        ...presentation.review_candidates,
        ...presentation.generated_candidates,
      ]
    : [];
  const enabled = preview.person.candidates.some((candidate) =>
    candidateReferenceUrl(
      candidate,
      preview.presentationPosters || candidate.manualExportAllowed
        ? rows.find((row) => row.candidate_id === candidate.id)
        : undefined,
    ),
  );
  useEffect(() => setCandidateId(undefined), [owner, preview.job, preview.person.index]);
  useEffect(() => {
    if (!candidateId) return;
    restore.current = document.activeElement as HTMLElement;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prior;
      restore.current?.focus({ preventScroll: true });
    };
  }, [candidateId]);
  return (
    <PreviewContext.Provider value={enabled ? setCandidateId : undefined}>
      {children}
      {candidateId &&
        enabled &&
        preview.person.candidates.some((candidate) => candidate.id === candidateId) &&
        createPortal(
          <div
            data-interactive-render-layer
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
            onClick={() => setCandidateId(undefined)}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-label="포즈 크게 보기"
              className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface-0 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setCandidateId(undefined);
                }
                if (e.key === "Tab") {
                  const nodes = dialog.current!.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input:not(:disabled),[tabindex='0']",
                  );
                  const first = nodes[0],
                    last = nodes[nodes.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                  }
                }
              }}
            >
              <div className="relative z-[20] flex items-center justify-between border-b bg-surface-0 p-3">
                <span>포즈 둘러보기</span>
                <button type="button" aria-label="닫기" onClick={() => setCandidateId(undefined)}>
                  <X size={20} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col [&>.selection-preview]:flex-1">
                <SelectionPreview
                  key={`${owner}:${preview.job}:${preview.person.index}`}
                  {...preview}
                  selectedId={candidateId}
                  renderLayer={1}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </PreviewContext.Provider>
  );
}

export function CandidatePreviewButton({ candidateId }: { candidateId: string }) {
  const open = useCandidatePreview();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="포즈 크게 보기"
      title="포즈 크게 보기"
      className="pointer-events-auto absolute bottom-1 right-1 z-[20] flex h-10 w-10 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        open(candidateId);
      }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-0/95 shadow-sm hover:bg-surface-0">
        <ZoomIn size={15} aria-hidden="true" />
      </span>
    </button>
  );
}
