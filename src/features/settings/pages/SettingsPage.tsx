import { AppShell } from "@/shared/components/AppShell";
import { ShortcutSettingsSection } from "../components/ShortcutSettingsSection";

/** 설정 화면(docs/03 §9). 이번 브랜치에서는 단축키 섹션만 구현한다. */
export function SettingsPage() {
  return (
    <AppShell title="설정">
      <div className="mx-auto flex max-w-[640px] flex-col gap-8">
        <ShortcutSettingsSection />

        <section>
          <h2 className="text-[15px] font-bold text-text-primary">그 외</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            로그아웃 · 기본 저장 폴더 · 테마 설정은 후속 브랜치에서 구현합니다.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
