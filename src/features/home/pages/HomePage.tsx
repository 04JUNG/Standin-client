import { useNavigate } from "react-router-dom";
import { Upload, Camera, Video } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useAuthStore } from "@/features/auth/store/authStore";

/**
 * 홈 화면 스켈레톤(docs/03 §4). 입력 카드 자리와 사용자 메뉴만 우선 구현.
 * 파일 DropZone / 캡처 흐름은 후속 브랜치(feat/file-input, feat/region-capture).
 */
export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await logout();
    navigate("/auth/login", { replace: true });
  }

  return (
    <AppShell
      title="홈"
      headerRight={
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-text-secondary">{user?.email}</span>
          <Button variant="secondary" size="md" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-[880px]">
        <h2 className="text-[22px] font-bold text-text-primary">
          어떤 장면을 3D 포즈로 바꿔볼까요?
        </h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          파일을 놓거나 화면에서 필요한 부분만 바로 캡처하세요.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <InputCard
            icon={Upload}
            title="파일 업로드"
            desc="PNG · JPG · WEBP 드래그 또는 선택"
            disabled
          />
          <InputCard
            icon={Camera}
            title="화면 캡처"
            desc="영역을 드래그해 바로 캡처"
            highlight
            disabled
          />
          <InputCard icon={Video} title="화면 녹화" desc="준비 중" disabled />
        </div>

        <p className="mt-6 text-[13px] text-text-secondary">
          입력 카드 동작은 후속 브랜치에서 연결됩니다(파일 입력 · 캡처).
        </p>
      </div>
    </AppShell>
  );
}

type InputCardProps = {
  icon: typeof Upload;
  title: string;
  desc: string;
  highlight?: boolean;
  disabled?: boolean;
};

function InputCard({ icon: Icon, title, desc, highlight, disabled }: InputCardProps) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={[
        "flex flex-col gap-2 rounded-xl border p-6 transition-colors",
        highlight ? "border-brand-coral bg-brand-coral/5" : "border-border bg-surface-0",
        disabled ? "opacity-60" : "hover:border-brand-ink/30",
      ].join(" ")}
    >
      <Icon className={highlight ? "h-6 w-6 text-brand-coral" : "h-6 w-6 text-brand-ink"} aria-hidden />
      <div className="text-[16px] font-semibold text-text-primary">{title}</div>
      <div className="text-[13px] text-text-secondary">{desc}</div>
    </div>
  );
}
