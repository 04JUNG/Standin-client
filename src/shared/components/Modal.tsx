import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { MODAL_OPEN_FLAG } from "@/shared/lib/keyboardTarget";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 스스로 Escape를 처리해야 하는 대화상자(키 재지정 등)는 false로 끈다. */
  closeOnEscape?: boolean;
  /** 패널 최대 폭. docs/04 §4는 dialog를 440~640px로 규정한다. */
  width?: "sm" | "md" | "lg";
  /**
   * 열릴 때 포커스를 받을 요소. 지정하지 않으면 패널의 첫 포커스 가능 요소(=닫기 버튼)로
   * 간다. 키 입력을 받아야 하는 대화상자는 반드시 넘겨야 한다.
   */
  initialFocus?: RefObject<HTMLElement>;
  children: ReactNode;
};

/**
 * 공통 모달(docs/02 §4 shared/components, docs/04 §4 dialog 규격).
 *
 * 포커스가 모달 뒤로 이동하지 않아야 한다는 docs/04 §13 요구사항 때문에 focus trap과
 * 포커스 복귀를 갖췄다. 열려 있는 동안 body에 표식을 세워 화면 단축키(useShortcuts)가
 * 물러나게 한다.
 *
 * Escape는 registry 단축키가 아니라 이 컴포넌트가 직접 처리한다 — 모달이 세운 표식
 * 때문에 useShortcuts가 물러나 있고, 모달 닫기는 앱 단축키가 아니라 UI 원시 동작이다.
 */
export function Modal({
  open,
  onClose,
  title,
  closeOnEscape = true,
  width = "md",
  initialFocus,
  children,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // 열릴 때 포커스를 패널로, 닫힐 때 원래 위치로 되돌린다.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // 자식 effect가 먼저 돌기 때문에 여기서 포커스를 다시 잡으면 자식이 지정한 위치를
    // 덮어쓴다. 그래서 대상은 항상 이 effect가 결정한다.
    const target = initialFocus?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open, initialFocus]);

  // 열려 있는 동안 화면 단축키를 멈춘다.
  useEffect(() => {
    if (!open) return;
    document.body.dataset[MODAL_OPEN_FLAG] = "true";
    return () => {
      delete document.body.dataset[MODAL_OPEN_FLAG];
    };
  }, [open]);

  // Escape 닫기 + Tab 순환.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // 경계에서 반대쪽으로 감아 포커스가 모달 밖으로 나가지 않게 한다.
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-brand-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl",
          "border border-border bg-surface-0 shadow-xl outline-none",
          width === "sm" && "max-w-[440px]",
          width === "md" && "max-w-[520px]",
          width === "lg" && "max-w-[640px]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-[15px] font-bold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
