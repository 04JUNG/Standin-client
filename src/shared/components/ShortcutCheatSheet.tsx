import { useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { Modal } from "./Modal";
import { ShortcutKey } from "./ShortcutKey";
import {
  SCOPE_LABEL,
  SCOPE_ORDER,
  listedShortcuts,
  resolveAccelerator,
} from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import type { ShortcutScope } from "@/shared/types/shortcuts";

/** 현재 경로에 해당하는 scope. 그 그룹을 강조해 지금 쓸 수 있는 키를 알려준다. */
function scopeForPath(pathname: string): ShortcutScope | null {
  if (pathname.startsWith("/app/capture")) return "captureOverlay";
  if (pathname.startsWith("/app/preview")) return "inputPreview";
  if (pathname.endsWith("/save")) return "save";
  if (pathname.startsWith("/app/jobs/")) return "poseViewer";
  if (pathname.startsWith("/app/home")) return "home";
  return null;
}

/**
 * 단축키 치트시트(docs/04 §13 "단축키를 화면에 표시", docs/07 §7 "화면에 현재 단축키 표시").
 * 목록은 레지스트리에서만 온다 — 여기에 하드코딩된 키는 없다.
 */
export function ShortcutCheatSheet() {
  const open = useShortcutStore((s) => s.cheatSheetOpen);
  const close = useShortcutStore((s) => s.closeCheatSheet);
  const bindings = useShortcutStore((s) => s.bindings);
  const globalStatus = useShortcutStore((s) => s.globalStatus);
  const { pathname } = useLocation();

  const activeScope = scopeForPath(pathname);

  return (
    <Modal open={open} onClose={close} title="단축키" width="lg">
      <div className="flex flex-col gap-5">
        {SCOPE_ORDER.map((scope) => {
          const items = listedShortcuts(scope);
          if (items.length === 0) return null;
          const isActive = scope === activeScope;

          return (
            <section key={scope} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                {isActive && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-brand-coral"
                    aria-label="현재 화면"
                  />
                )}
                {SCOPE_LABEL[scope]}
              </h3>

              <ul className="flex flex-col gap-1">
                {items.map((def) => {
                  const accel = resolveAccelerator(def.id, bindings);
                  if (!accel) return null;
                  // 전역 키가 등록되지 않았으면 지금은 동작하지 않는다는 것을 표시한다.
                  const inactive = def.scope === "global" && globalStatus !== "registered";

                  return (
                    <li
                      key={def.id}
                      className={cn(
                        "flex items-baseline justify-between gap-4 rounded-lg px-2 py-1.5",
                        isActive && "bg-brand-coral/5",
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-[13px] text-text-primary">{def.label}</span>
                        {def.hint && (
                          <span className="text-[11px] text-text-secondary">{def.hint}</span>
                        )}
                        {inactive && (
                          <span className="text-[11px] text-brand-coral">
                            {globalStatus === "unavailable"
                              ? "브라우저 개발 모드에서는 사용할 수 없습니다."
                              : "전역 등록 전이라 앱이 활성일 때만 동작합니다."}
                          </span>
                        )}
                      </div>
                      <ShortcutKey accelerator={accel} muted={inactive} className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <p className="flex items-center gap-2 border-t border-border pt-3 text-[12px] text-text-secondary">
          <ShortcutKey accelerator="Shift+Slash" />
          <span>로 이 창 열기</span>
          <span aria-hidden>·</span>
          <ShortcutKey accelerator="Escape" />
          <span>로 닫기</span>
        </p>
      </div>
    </Modal>
  );
}
