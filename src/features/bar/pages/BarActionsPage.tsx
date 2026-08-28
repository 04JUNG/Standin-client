import { useRef } from "react";
import { AlertCircle, Camera, Loader2, Upload } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { ACCEPT_ATTR } from "@/features/upload/constants";
import { useImageInput } from "@/features/upload/hooks/useImageInput";
import { useCaptureStore } from "@/features/capture/store/captureStore";
import { startCaptureFlow } from "@/features/capture/lib/startCaptureFlow";
import { captureService } from "@/features/capture/api/capture.service";
import { BarShell } from "../components/BarShell";

/**
 * 바의 기본 동작(ADR-008): 캡처 · 업로드.
 *
 * 업로드는 useImageInput을 그대로 재사용한다 — 검증·초안 생성 로직이 앱 모드와 같다.
 * 드래그 앤 드롭은 바가 좁아 실용성이 낮으므로 버튼만 제공한다.
 */
/** 바는 폭이 좁아 버튼 두 개가 줄바꿈된다. 스타일을 한 곳에 두고 둘 다 같게 유지한다. */
const RECOVERY_BUTTON = cn(
  "rounded border border-brand-coral/40 px-1.5 py-0.5 font-semibold",
  "transition-colors hover:bg-brand-coral/10",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
);

export function BarActionsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { acceptFile, error, isProcessing } = useImageInput({ origin: "bar" });
  const captureStatus = useCaptureStore((s) => s.status);
  const captureError = useCaptureStore((s) => s.error);
  const captureErrorCode = useCaptureStore((s) => s.errorCode);
  const bindings = useShortcutStore((s) => s.bindings);

  const isGrabbing = captureStatus === "grabbing";
  const busy = isGrabbing || isProcessing;

  useShortcuts({
    "bar.capture": busy ? undefined : () => void startCaptureFlow("bar"),
    "bar.upload": busy ? undefined : () => inputRef.current?.click(),
  });

  const message = captureError ?? error;

  return (
    <BarShell title="Standin">
      <div className="flex flex-col gap-1 p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <BarAction
            icon={busy && isGrabbing ? Loader2 : Camera}
            spinning={isGrabbing}
            label="화면 캡처"
            accelerator={resolveAccelerator("bar.capture", bindings)}
            disabled={busy}
            primary
            onClick={() => void startCaptureFlow("bar")}
          />
          <BarAction
            icon={busy && isProcessing ? Loader2 : Upload}
            spinning={isProcessing}
            label="파일 업로드"
            accelerator={resolveAccelerator("bar.upload", bindings)}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          />
        </div>

        {message && (
          <div role="alert" className="flex items-start gap-1 px-1 text-[11px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <div>
              <p>{message}</p>
              {/* 바에서 캡처하다 권한에 막혀도 여기서 바로 설정으로 갈 수 있어야 한다.
                  앱 창을 다시 띄우게 만들면 복구 경로가 한 단계 늘어난다. */}
              {captureError && captureErrorCode === "PERMISSION_DENIED" && (
                <span className="mt-0.5 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => void captureService.openScreenRecordingSettings()}
                    className={RECOVERY_BUTTON}
                  >
                    시스템 설정 열기
                  </button>
                  <button
                    type="button"
                    onClick={() => void captureService.relaunchApp()}
                    className={RECOVERY_BUTTON}
                  >
                    앱 다시 시작
                  </button>
                </span>
              )}
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void acceptFile(file);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />
      </div>
    </BarShell>
  );
}

type BarActionProps = {
  icon: typeof Camera;
  spinning?: boolean;
  label: string;
  accelerator?: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
};

function BarAction({
  icon: Icon,
  spinning,
  label,
  accelerator,
  disabled,
  primary,
  onClick,
}: BarActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        "disabled:cursor-not-allowed disabled:opacity-60",
        primary
          ? "border-brand-coral/40 bg-brand-coral/10 hover:border-brand-coral"
          : "border-border bg-surface-1 hover:border-brand-ink/30",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          spinning && "animate-spin",
          primary ? "text-brand-coral" : "text-brand-ink",
        )}
        aria-hidden
      />
      <span className="text-[12px] font-semibold text-text-primary">{label}</span>
      {accelerator && <ShortcutKey accelerator={accelerator} />}
    </button>
  );
}
