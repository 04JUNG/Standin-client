import { Camera, Video, AlertCircle, ExternalLink } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { ShortcutKey } from "@/shared/components/ShortcutKey";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { DropZone } from "@/features/upload/components/DropZone";
import { useStartCapture } from "@/features/capture/hooks/useStartCapture";
import { toggleBar } from "@/features/bar/lib/openBar";
import { cn } from "@/shared/lib/cn";
import { tourAnchor } from "@/shared/lib/tourAnchor";
import { captureService } from "@/features/capture/api/capture.service";
import { openExternal } from "@/shared/lib/openExternal";
import { env } from "@/shared/lib/env";

/**
 * 홈 화면(docs/03 §4, docs/04 §7). 파일 입력(DropZone)과 화면 캡처가 동작한다.
 * 화면 녹화는 지원 범위 밖이라, 카드를 눌러도 녹화가 시작되지 않고 랜딩의 설문이 열린다.
 */
/** 권한 오류에서만 쓰는 작은 복구 버튼. */
const RECOVERY_BUTTON = [
  "rounded-md border border-brand-coral/40 px-2 py-1 text-[12px] font-semibold",
  "transition-colors hover:bg-brand-coral/10",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
].join(" ");

export function HomePage() {
  const {
    start: startCapture,
    isStarting,
    error: captureError,
    errorCode: captureErrorCode,
  } = useStartCapture();
  const bindings = useShortcutStore((s) => s.bindings);
  const globalStatus = useShortcutStore((s) => s.globalStatus);

  const captureAccelerator = resolveAccelerator("capture.start", bindings)!;
  // 전역 등록이 살아 있으면 네이티브가 처리하므로 앱 내 대체 경로를 끈다(이중 발동 방지).
  const globalActive = globalStatus === "registered";

  useShortcuts({
    // 전역 등록이 살아 있으면 네이티브가 바를 여니 여기서는 끈다(이중 발동 방지).
    "home.startCapture": globalActive ? undefined : () => void toggleBar(),
  });

  return (
    <AppShell title="홈">
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
            {...tourAnchor("home.capture")}
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
            {/* 전역 등록 전에는 흐리게 + 안내. 동작하지 않는 것을 동작하는 것처럼
                보이게 하지 않는다(CLAUDE.md §10). */}
            <ShortcutKey
              accelerator={captureAccelerator}
              muted={!globalActive}
              className="ml-auto shrink-0"
              title={
                globalActive
                  ? "다른 프로그램을 쓰는 중에도 이 키로 캡처할 수 있습니다."
                  : "지금은 Standin 창이 활성일 때만 동작합니다."
              }
            />
          </button>

          {/* 녹화는 지원하지 않는다. 카드가 녹화를 시작하는 것처럼 보이면 안 되므로(CLAUDE.md §10)
              라벨과 아이콘으로 "설문이 열린다"를 먼저 알린다. */}
          <button
            type="button"
            onClick={() => void openExternal(`${env.webBaseUrl}/feedback/`)}
            className={[
              "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              "border-border bg-surface-0 hover:border-brand-sky hover:bg-brand-sky/5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
            ].join(" ")}
          >
            <Video className="h-5 w-5 text-brand-ink" aria-hidden />
            <div>
              <div className="text-[14px] font-semibold text-text-primary">화면 녹화</div>
              <div className="text-[12px] text-text-secondary">
                현재 지원 범위 밖입니다. 설문으로 의견을 남겨주세요.
              </div>
            </div>
            <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          </button>
        </div>

        {captureError && (
          <div role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-brand-coral">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p>{captureError}</p>
              {/* 권한을 한 번 거부하면 시스템 프롬프트가 다시 뜨지 않는다. 설정까지
                  가는 길을 앱이 열어준다(docs/07 §4). 재시작은 여기서 다루지 않는다 —
                  설정에서 허용하는 순간 macOS가 직접 묻는다. */}
              {captureErrorCode === "PERMISSION_DENIED" && (
                <button
                  type="button"
                  onClick={() => void captureService.openScreenRecordingSettings()}
                  className={cn(RECOVERY_BUTTON, "mt-1")}
                >
                  시스템 설정 열기
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
