import { useNavigate } from "react-router-dom";
import { Camera, Video, AlertCircle } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useAuthStore } from "@/features/auth/store/authStore";
import { DropZone } from "@/features/upload/components/DropZone";
import { useStartCapture } from "@/features/capture/hooks/useStartCapture";

/**
 * 홈 화면(docs/03 §4, docs/04 §7). 파일 입력(DropZone)이 동작한다.
 * 화면 캡처/녹화는 후속 브랜치(feat/region-capture)에서 연결.
 */
export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { start: startCapture, isStarting, error: captureError } = useStartCapture();

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

        <div className="mt-6">
          <DropZone />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void startCapture()}
            disabled={isStarting}
            className={[
              "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              "border-brand-coral/40 bg-brand-coral/5 hover:border-brand-coral",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              "disabled:cursor-not-allowed disabled:opacity-60",
            ].join(" ")}
          >
            <Camera className="h-5 w-5 text-brand-coral" aria-hidden />
            <div>
              <div className="text-[14px] font-semibold text-text-primary">화면 캡처</div>
              <div className="text-[12px] text-text-secondary">
                {isStarting ? "화면을 준비하는 중…" : "영역을 드래그해 바로 캡처"}
              </div>
            </div>
          </button>

          <SecondaryCard icon={Video} title="화면 녹화" desc="준비 중" />
        </div>

        {captureError && (
          <p role="alert" className="mt-3 flex items-center gap-2 text-[13px] text-brand-coral">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {captureError}
          </p>
        )}

        <p className="mt-6 text-[13px] text-text-secondary">
          화면 녹화는 후속 스프린트에서 연결됩니다.
        </p>
      </div>
    </AppShell>
  );
}

type SecondaryCardProps = {
  icon: typeof Camera;
  title: string;
  desc: string;
  highlight?: boolean;
};

function SecondaryCard({ icon: Icon, title, desc, highlight }: SecondaryCardProps) {
  return (
    <div
      aria-disabled
      className={[
        "flex items-center gap-3 rounded-xl border p-4 opacity-60",
        highlight ? "border-brand-coral/40 bg-brand-coral/5" : "border-border bg-surface-0",
      ].join(" ")}
    >
      <Icon
        className={highlight ? "h-5 w-5 text-brand-coral" : "h-5 w-5 text-brand-ink"}
        aria-hidden
      />
      <div>
        <div className="text-[14px] font-semibold text-text-primary">{title}</div>
        <div className="text-[12px] text-text-secondary">{desc}</div>
      </div>
    </div>
  );
}
