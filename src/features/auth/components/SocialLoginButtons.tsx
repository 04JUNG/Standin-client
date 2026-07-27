import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { OAuthProvider } from "../api/auth.contract";

type ProviderMeta = {
  id: OAuthProvider;
  label: string;
  className: string;
  mark: string;
};

/** 소셜 provider 표시(브랜드 컬러). BFF `/v1/auth/oauth/:provider`와 id가 일치. */
const PROVIDERS: ProviderMeta[] = [
  {
    id: "kakao",
    label: "카카오로 계속하기",
    className: "bg-[#FEE500] text-[#191600] hover:brightness-95",
    mark: "K",
  },
  {
    id: "naver",
    label: "네이버로 계속하기",
    className: "bg-[#03C75A] text-white hover:brightness-95",
    mark: "N",
  },
  {
    id: "google",
    label: "Google로 계속하기",
    className: "border border-border bg-surface-0 text-text-primary hover:bg-surface-2",
    mark: "G",
  },
];

type Props = {
  onSelect: (provider: OAuthProvider) => void | Promise<void>;
  disabled?: boolean;
};

/** 로그인 화면의 소셜 로그인 버튼 묶음(카카오·네이버·구글). */
export function SocialLoginButtons({ onSelect, disabled }: Props) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  async function handle(provider: OAuthProvider) {
    setPending(provider);
    try {
      await onSelect(provider);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map((p) => {
        const loading = pending === p.id;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled || pending !== null}
            aria-busy={loading || undefined}
            onClick={() => handle(p.id)}
            className={cn(
              "relative inline-flex h-btn-lg items-center justify-center rounded-lg px-6 text-[15px] font-semibold",
              "transition-[filter,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              "disabled:cursor-not-allowed disabled:opacity-60",
              p.className,
            )}
          >
            <span
              aria-hidden
              className="absolute left-4 flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[12px] font-bold"
            >
              {p.mark}
            </span>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : p.label}
          </button>
        );
      })}
    </div>
  );
}
