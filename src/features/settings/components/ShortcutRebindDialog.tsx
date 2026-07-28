import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { acceleratorFromEvent } from "@/shared/lib/accelerator";
import { findConflict } from "@/shared/lib/shortcutConflicts";
import { SHORTCUTS_BY_ID, resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import type { Accelerator, ShortcutId } from "@/shared/types/shortcuts";

type Props = {
  open: boolean;
  shortcutId: ShortcutId | null;
  onClose: () => void;
};

/**
 * 단축키 재지정 대화상자(docs/07 §7 "설정에서 변경").
 *
 * 여기서는 store에 값만 넣는다. 네이티브 등록은 captureShortcut의 store 구독이
 * 소유하므로 이 컴포넌트에 async 로직이 없다.
 *
 * Escape를 자기가 처리해야 하므로 Modal의 closeOnEscape를 끈다.
 */
export function ShortcutRebindDialog({ open, shortcutId, onClose }: Props) {
  const bindings = useShortcutStore((s) => s.bindings);
  const setBinding = useShortcutStore((s) => s.setBinding);

  const [pending, setPending] = useState<Accelerator | null>(null);
  // 열리는 즉시 키를 받을 수 있어야 한다. 기본 포커스는 닫기 버튼으로 가므로 명시한다.
  const captureRef = useRef<HTMLDivElement>(null);

  // 열릴 때마다 초기화한다.
  useEffect(() => {
    if (open) setPending(null);
  }, [open, shortcutId]);

  if (!shortcutId) return null;
  // 좁혀진 값을 지역 상수로 잡아 아래 핸들러 클로저에서도 non-null로 쓴다.
  const id = shortcutId;
  const def = SHORTCUTS_BY_ID[id];
  if (!def) return null;

  const current = resolveAccelerator(id, bindings);
  const conflict = pending ? findConflict(id, pending, bindings) : null;
  const canSave = Boolean(pending) && !conflict;

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // 이 영역 안에서는 모든 키를 가로챈다 — 재지정 중에 다른 동작이 끼면 안 된다.
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.nativeEvent.isComposing) return;

    // 수정자만 눌린 상태는 아직 확정이 아니다(라이브 프리뷰 없이 무시).
    const next = acceleratorFromEvent(e.nativeEvent);
    if (next) setPending(next);
  }

  function commit() {
    if (!pending || conflict) return;
    setBinding(id, pending);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${def.label} 단축키 변경`}
      closeOnEscape={false}
      width="sm"
      initialFocus={captureRef}
    >
      <div className="flex flex-col gap-4">
        {/* 키 입력을 받는 영역. 포커스를 받아야 keydown이 온다. */}
        <div
          ref={captureRef}
          tabIndex={0}
          role="group"
          aria-label="새 단축키를 누르세요"
          onKeyDown={onKeyDown}
          className={[
            "flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4",
            "focus:border-brand-coral focus:outline-none",
            conflict ? "border-brand-coral/60 bg-brand-coral/5" : "border-border bg-surface-1",
          ].join(" ")}
        >
          {pending ? (
            <ShortcutKey accelerator={pending} />
          ) : (
            <span className="text-[13px] text-text-secondary">새 단축키를 누르세요</span>
          )}
          <span className="text-[11px] text-text-secondary">
            현재: {current ? null : "없음"}
            {current && <ShortcutKey accelerator={current} className="ml-1 align-middle" />}
          </span>
        </div>

        {conflict && (
          <p role="alert" className="text-[12px] text-brand-coral">
            {conflict.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            취소
          </Button>
          <Button size="md" disabled={!canSave} onClick={commit}>
            저장
          </Button>
        </div>
      </div>
    </Modal>
  );
}
