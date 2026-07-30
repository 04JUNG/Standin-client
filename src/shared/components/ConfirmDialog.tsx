import { useRef } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작이면 확인 버튼을 강조색으로. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 되돌리기 어려운 동작 전 확인(docs/04 §4 dialog).
 *
 * 초기 포커스를 취소에 둔다 — 확인에 두면 Enter를 연타하다 실수로 진행된다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal open={open} onClose={onCancel} title={title} width="sm" initialFocus={cancelRef}>
      <p className="text-[14px] text-text-secondary">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "primary" : "secondary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
