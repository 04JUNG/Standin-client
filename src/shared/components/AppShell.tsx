import { type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, History, Settings, Keyboard, PictureInPicture2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { env } from "@/shared/lib/env";
import { useAppShortcuts } from "@/shared/hooks/useAppShortcuts";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";

type NavItem = { to: string; label: string; icon: typeof Home; disabled?: boolean };

const navItems: NavItem[] = [
  { to: "/app/home", label: "홈", icon: Home },
  { to: "/app/jobs", label: "작업 기록", icon: History, disabled: true },
  { to: "/app/settings", label: "설정", icon: Settings },
];

type AppShellProps = {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
};

/**
 * 앱 셸: Ink 사이드바 + 상단 앱 바(docs/03 §3, docs/04 §6).
 *
 * 라우터가 flat 구조라 layout route가 없으므로 여기가 앱 전역 단축키와 치트시트의
 * 유일한 마운트 지점이다. LoginPage·CaptureOverlayPage는 AppShell을 쓰지 않아
 * 구조적으로 제외된다 — 의도한 동작이다.
 */
export function AppShell({ title, headerRight, children }: AppShellProps) {
  useAppShortcuts();
  const openCheatSheet = useShortcutStore((s) => s.openCheatSheet);
  // 바 전환은 경로 이동이면 충분하다. shared에서 features를 import하지 않기 위해
  // navigate만 쓴다(인증 가드는 /bar 라우트의 RequireAuth가 담당).
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="flex w-sidebar flex-col bg-brand-ink text-white/90">
        <div className="flex h-topbar items-center px-4 text-[18px] font-bold">Standin</div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ to, label, icon: Icon, disabled }) =>
            disabled ? (
              <span
                key={to}
                aria-disabled
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] text-white/40"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] transition-colors",
                    isActive
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </NavLink>
            ),
          )}
        </nav>
        {env.useMockApi && (
          <div className="px-4 py-3">
            <span className="rounded bg-brand-coral/20 px-2 py-1 text-[11px] font-semibold text-brand-coral">
              MOCK 모드
            </span>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-topbar items-center justify-between border-b border-border bg-surface-0 px-6">
          <h1 className="text-[16px] font-bold text-text-primary">{title}</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/bar/actions")}
              aria-label="플로팅 바로 전환"
              title="플로팅 바로 전환 — 작업 화면 위에 작게 띄웁니다"
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-lg px-3 transition-colors",
                "text-[13px] font-semibold text-text-secondary",
                "hover:bg-surface-2 hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              )}
            >
              <PictureInPicture2 className="h-4 w-4" aria-hidden />
              플로팅 바
            </button>
            <button
              type="button"
              onClick={openCheatSheet}
              aria-label="단축키 도움말 (?)"
              title="단축키 도움말 (?)"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              )}
            >
              <Keyboard className="h-4 w-4" aria-hidden />
            </button>
            {headerRight}
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-surface-1 p-6">{children}</main>
      </div>

      <ShortcutCheatSheet />
    </div>
  );
}
