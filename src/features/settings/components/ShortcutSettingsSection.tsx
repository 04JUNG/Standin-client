import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import {
  DEFAULT_BINDINGS,
  SCOPE_LABEL,
  SCOPE_ORDER,
  listedShortcuts,
  resolveAccelerator,
} from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import type { ShortcutId } from "@/shared/types/shortcuts";
import { ShortcutRebindDialog } from "./ShortcutRebindDialog";

/**
 * 설정의 단축키 섹션(docs/03 §9, docs/07 §7).
 *
 * 전역 단축키만 재지정할 수 있다. 앱 내 단축키는 고정이고 목록으로만 보여준다.
 * 등록 실패는 복구 행동(다른 키 선택)이 필요하므로 Toast가 아니라 화면 안의
 * 인라인 오류로 처리한다(docs/04 §11 "복구 행동이 필요한 오류는 화면 또는 dialog").
 */
export function ShortcutSettingsSection() {
  const bindings = useShortcutStore((s) => s.bindings);
  const globalStatus = useShortcutStore((s) => s.globalStatus);
  const globalError = useShortcutStore((s) => s.globalError);
  const resetBinding = useShortcutStore((s) => s.resetBinding);
  const revertGlobal = useShortcutStore((s) => s.revertGlobal);
  const previousGlobal = useShortcutStore((s) => s.previousGlobal);
  const openCheatSheet = useShortcutStore((s) => s.openCheatSheet);

  const [rebinding, setRebinding] = useState<ShortcutId | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-text-primary">단축키</h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            전역 단축키는 다른 프로그램을 쓰는 중에도 동작합니다.
          </p>
        </div>
        <Button variant="ghost" size="md" onClick={openCheatSheet}>
          단축키 전체 보기
        </Button>
      </div>

      {SCOPE_ORDER.map((scope) => {
        const items = listedShortcuts(scope);
        if (items.length === 0) return null;

        return (
          <div key={scope} className="flex flex-col gap-1">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-text-secondary">
              {SCOPE_LABEL[scope]}
            </h3>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface-0">
              {items.map((def) => {
                const accel = resolveAccelerator(def.id, bindings);
                if (!accel) return null;
                const isGlobal = def.scope === "global";
                const isDefault = accel === DEFAULT_BINDINGS[def.id];

                return (
                  <li key={def.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[13px] text-text-primary">{def.label}</span>
                        {def.hint && (
                          <span className="text-[11px] text-text-secondary">{def.hint}</span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <ShortcutKey
                          accelerator={accel}
                          muted={isGlobal && globalStatus !== "registered"}
                        />
                        {def.customizable ? (
                          <>
                            <Button
                              variant="secondary"
                              size="md"
                              onClick={() => setRebinding(def.id)}
                            >
                              변경
                            </Button>
                            {!isDefault && (
                              <Button
                                variant="ghost"
                                size="md"
                                onClick={() => resetBinding(def.id)}
                              >
                                기본값
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] text-text-secondary">고정</span>
                        )}
                      </div>
                    </div>

                    {isGlobal && (
                      <GlobalStatusRow
                        status={globalStatus}
                        error={globalError}
                        canRevert={Boolean(previousGlobal)}
                        onRevert={revertGlobal}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <ShortcutRebindDialog
        open={rebinding !== null}
        shortcutId={rebinding}
        onClose={() => setRebinding(null)}
      />
    </section>
  );
}

function GlobalStatusRow({
  status,
  error,
  canRevert,
  onRevert,
}: {
  status: ReturnType<typeof useShortcutStore.getState>["globalStatus"];
  error: string | null;
  canRevert: boolean;
  onRevert: () => void;
}) {
  if (status === "registered") {
    return (
      <p aria-live="polite" className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Check className="h-3.5 w-3.5 shrink-0 text-brand-coral" aria-hidden />
        등록됨
      </p>
    );
  }

  if (status === "registering") {
    return (
      <p aria-live="polite" className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        등록 중…
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <p className="text-[11px] text-text-secondary">
        데스크톱 앱에서만 사용할 수 있습니다. (브라우저 개발 모드)
      </p>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-brand-coral/10 p-2.5">
        <p role="alert" className="flex items-start gap-1.5 text-[12px] text-brand-coral">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error ?? "전역 단축키를 등록하지 못했습니다."}
        </p>
        {canRevert && (
          <Button variant="ghost" size="md" onClick={onRevert}>
            이전 단축키로 되돌리기
          </Button>
        )}
      </div>
    );
  }

  return null;
}
