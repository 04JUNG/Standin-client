import { useState } from "react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useInstallationStore } from "@/features/installation/installationStore";
import { SaveFolderSection } from "../components/SaveFolderSection";
import { ShortcutSettingsSection } from "../components/ShortcutSettingsSection";

export function SettingsPage() {
  const installationId = useInstallationStore((state) => state.credentials?.installationId);
  const withdraw = useInstallationStore((state) => state.withdraw);
  const withdrawError = useInstallationStore((state) => state.error);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  async function withdrawData() {
    if (!window.confirm("수집 동의를 철회하고 이 설치와 연결된 데이터를 삭제할까요?")) return;
    setIsWithdrawing(true);
    try {
      // 실패는 store의 error로 들어온다. 삭제 요청이 실패했는데 화면이 조용하면
      // 사용자는 데이터가 지워진 줄 안다(동의 화면에서 약속한 항목이다).
      await withdraw();
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <AppShell title="설정">
      <div className="mx-auto flex max-w-[640px] flex-col gap-8">
        <SaveFolderSection />
        <ShortcutSettingsSection />

        <section>
          <h2 className="text-[15px] font-bold text-text-primary">베타 데이터</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-0 p-4">
            <div className="min-w-0">
              <p className="text-[14px] text-text-primary">설치 ID</p>
              <p className="truncate text-[12px] text-text-secondary">{installationId ?? "-"}</p>
              <p className="mt-1 text-[12px] text-text-secondary">
                원본은 90일, 연결 가능한 분석 데이터는 1년 보관됩니다.
              </p>
            </div>
            <Button
              variant="secondary"
              size="md"
              disabled={isWithdrawing}
              onClick={() => void withdrawData()}
            >
              {isWithdrawing ? "삭제 요청 중…" : "동의 철회 및 삭제"}
            </Button>
          </div>
          {withdrawError && (
            <p role="alert" className="mt-2 text-[12px] text-brand-coral">
              {withdrawError}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
