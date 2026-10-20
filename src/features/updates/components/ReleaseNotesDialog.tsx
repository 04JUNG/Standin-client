import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/Button";
import { safeStorage } from "@/shared/lib/safeStorage";
import { hasSeenTour, useTourStore } from "@/shared/stores/tourStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useUpdateStore } from "../store/updateStore";
import { useUpdateBlockReason } from "../hooks/useUpdateBlockReason";
import {
  releases,
  releasesBetween,
  markReleaseSeen,
  releaseHistory,
  SEEN_RELEASE_KEY,
  useReleaseNotesStore,
} from "../lib/releaseNotes";

export function ReleaseNotesDialog() {
  const { pathname } = useLocation();
  const version = useUpdateStore((s) => s.version);
  const configured = useUpdateStore((s) => s.configured);
  const tour = useTourStore();
  const registered = useInstallationStore((s) => s.status === "registered");
  const requested = useReleaseNotesStore((s) => s.historyRequested);
  const closeHistory = useReleaseNotesStore((s) => s.closeHistory);
  const { reason } = useUpdateBlockReason();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => safeStorage.getItem(SEEN_RELEASE_KEY));
  const [all, setAll] = useState(false);
  const unseen = version ? releasesBetween(releases, seen, version) : [];
  const eligible =
    configured &&
    registered &&
    !tour.active &&
    hasSeenTour(tour) &&
    !reason &&
    ["/app/home", "/app/settings"].includes(pathname);

  useEffect(() => {
    if (open) return;
    if (!requested && (!eligible || unseen.length === 0)) return;
    if (tour.active) return;
    // Allow consent, tours and existing dialogs to finish before opening.
    const attempt = () => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setAll(requested);
      setOpen(true);
    };
    const timer = window.setTimeout(attempt, 500);
    const observer = new MutationObserver(attempt);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [eligible, open, requested, tour.active, unseen.length]);

  if (!version) return null;
  const entries = all ? releaseHistory(version) : unseen;
  const close = () => {
    markReleaseSeen(version);
    setSeen(safeStorage.getItem(SEEN_RELEASE_KEY));
    setOpen(false);
    closeHistory();
  };
  return (
    <Modal
      open={open && !tour.active}
      onClose={close}
      width="md"
      title={all ? "변경 내역" : seen ? `Standin ${version} 업데이트 완료` : "이번 버전 소개"}
    >
      <div className="flex flex-col gap-5">
        {entries.map((entry) => (
          <article key={entry.version} className="rounded-xl border border-border bg-surface-0 p-4">
            <p className="text-xs text-text-secondary">
              {entry.version} · {entry.date}
            </p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">{entry.title}</h3>
            {(
              [
                ["features", "새 기능"],
                ["improvements", "개선"],
                ["fixes", "오류 수정"],
              ] as const
            )
              .filter(([key]) => entry[key].length > 0)
              .map(([key, label]) => (
                <section key={key} className="mt-4">
                  <h4 className="text-xs font-semibold text-text-primary">{label}</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-text-secondary">
                    {entry[key].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ))}
          </article>
        ))}
        {!entries.length && (
          <p className="text-sm text-text-secondary">표시할 변경 내역이 없습니다.</p>
        )}
        <div className="flex justify-end gap-2">
          {!all && (
            <Button variant="ghost" size="md" onClick={() => setAll(true)}>
              전체 변경 내역 보기
            </Button>
          )}
          <Button variant="primary" size="md" onClick={close}>
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
