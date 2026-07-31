import { AppShell } from "@/shared/components/AppShell";
import { useAuthStore } from "@/features/auth/store/authStore";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { SaveFolderSection } from "../components/SaveFolderSection";
import { ShortcutSettingsSection } from "../components/ShortcutSettingsSection";

/** 설정 화면(docs/03 §9). 기본 저장 폴더 · 단축키 · 계정 섹션을 제공한다. */
export function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <AppShell title="설정">
      <div className="mx-auto flex max-w-[640px] flex-col gap-8">
        <SaveFolderSection />

        <ShortcutSettingsSection />

        <section>
          <h2 className="text-[15px] font-bold text-text-primary">계정</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-0 p-4">
            <div className="min-w-0">
              <p className="truncate text-[14px] text-text-primary">{user?.email ?? "-"}</p>
              {user?.displayName && (
                <p className="truncate text-[13px] text-text-secondary">{user.displayName}</p>
              )}
            </div>
            <LogoutButton />
          </div>
        </section>

        <section>
          <h2 className="text-[15px] font-bold text-text-primary">그 외</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            테마 설정은 후속 브랜치에서 구현합니다.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
