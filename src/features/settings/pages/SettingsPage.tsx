import { AppShell } from "@/shared/components/AppShell";

/** 설정 화면 placeholder(docs/03 §9). 항목은 후속 브랜치에서 구현. */
export function SettingsPage() {
  return (
    <AppShell title="설정">
      <div className="mx-auto max-w-[640px]">
        <p className="text-[14px] text-text-secondary">
          로그아웃 · 캡처 단축키 · 기본 저장 폴더 · 테마 설정이 이 화면에 들어옵니다.
        </p>
      </div>
    </AppShell>
  );
}
