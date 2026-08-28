import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { useScreenPermission } from "@/features/capture/hooks/useScreenPermission";

/**
 * 설정의 화면 기록 권한 섹션(macOS 전용).
 *
 * 온보딩 단계는 새로 설치하는 사용자만 지나간다. 이미 등록을 마친 사용자에게는 캡처가
 * 실패하는 순간 말고는 권한을 켤 경로가 없으므로, 오류를 겪기 전에 여기서 고칠 수 있게 한다.
 */
export function ScreenPermissionSection() {
  const { status, requested, busy, request, openSettings, relaunchApp } = useScreenPermission();

  // 조회 전이거나 권한 개념이 없는 플랫폼(Windows)에서는 섹션 자체를 만들지 않는다.
  if (status === "checking" || status === "not_required") return null;

  const granted = status === "granted";

  return (
    <section>
      <h2 className="text-[15px] font-bold text-text-primary">화면 캡처 권한</h2>
      <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-0 p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] text-text-primary">
            {granted ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-brand-coral" aria-hidden />
            )}
            {granted ? "화면 기록 권한이 허용되어 있습니다." : "화면 기록 권한이 필요합니다."}
          </p>
          <p className="mt-1 text-[12px] text-text-secondary">
            {granted
              ? "화면 캡처를 사용할 수 있습니다."
              : "허용하지 않으면 캡처 결과에 작업 중인 창이 담기지 않습니다. 허용하면 macOS가 Standin을 다시 시작할지 물어봅니다."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {!granted &&
            // 프롬프트는 한 번만 뜬다. 이미 요청했으면 설정 창이 유일한 복구 경로다.
            (requested ? (
              <Button variant="secondary" size="md" onClick={() => void openSettings()}>
                시스템 설정 열기
              </Button>
            ) : (
              <Button variant="secondary" size="md" loading={busy} onClick={() => void request()}>
                권한 허용하기
              </Button>
            ))}
          {/*
            막다른 길 하나를 위한 탈출구다. macOS가 띄우는 재시작 확인에서 "나중에"를
            고르면 권한은 켜졌는데(=우리 확인은 통과) 실행 중인 프로세스는 여전히 못
            찍는다. 그 상태에서는 캡처가 오류 없이 배경화면을 돌려주므로 앱이 알아낼
            방법이 없다. 캡처 흐름에는 두지 않는다 — 거기서는 macOS가 이미 묻는다.
          */}
          <Button variant="ghost" size="md" onClick={() => void relaunchApp()}>
            앱 다시 시작
          </Button>
        </div>
      </div>
    </section>
  );
}
