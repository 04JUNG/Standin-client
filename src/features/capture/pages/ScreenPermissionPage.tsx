import { Navigate, useNavigate } from "react-router-dom";
import { MonitorCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { useScreenPermission } from "../hooks/useScreenPermission";

/**
 * 온보딩의 화면 기록 권한 단계(ADR-003 2026-08-28 정정).
 *
 * 권한 요청을 첫 캡처가 아니라 여기로 당긴 이유는 재실행 때문이다. macOS는 권한을 켜도
 * 프로세스를 다시 시작하기 전까지 반영하지 않는데, 첫 캡처 시점에 그걸 요구하면 작가가
 * 캡처하려는 바로 그 순간에 앱을 껐다 켜게 만든다. 설치 직후라면 잃을 작업이 없다.
 *
 * 다만 막지는 않는다. 파일 업로드는 권한 없이도 동작하므로 여기서 나가는 길을 항상 둔다.
 */
export function ScreenPermissionPage() {
  const navigate = useNavigate();
  const { status, requested, busy, request, openSettings } = useScreenPermission();

  // 권한이 이미 있거나 권한 개념이 없는 플랫폼이면 이 단계는 존재하지 않는다.
  // (URL로 직접 들어온 경우까지 포함)
  if (status === "granted" || status === "not_required") return <Navigate to="/app/home" replace />;

  const goHome = () => navigate("/app/home", { replace: true });

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-paper p-6">
      <section className="w-full max-w-[560px] rounded-2xl border border-border bg-surface-0 p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <MonitorCheck className="h-6 w-6 text-brand-coral" aria-hidden />
          <h1 className="text-xl font-bold text-text-primary">화면 캡처 권한 허용</h1>
        </div>

        <div className="mt-5 space-y-4 text-sm leading-6 text-text-secondary">
          <p>
            화면에서 필요한 부분만 잘라 분석하려면 macOS의 <strong>화면 기록</strong> 권한이
            필요합니다. 권한이 없으면 캡처 결과에 작업 중인 창이 담기지 않습니다.
          </p>
          <p className="rounded-xl border border-border bg-surface-2 p-4 text-[13px]">
            지금 허용해 두면 나중에 캡처하려는 순간에 흐름이 끊기지 않습니다. 권한이 바로
            반영되지 않는 경우가 있어, 그때는 앱을 한 번 다시 시작하면 됩니다.
          </p>
          {requested && (
            <p className="text-[13px] text-text-primary">
              프롬프트가 보이지 않거나 이미 닫았다면, 아래에서 시스템 설정을 열어 목록의
              Standin을 켜 주세요.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {/* 프롬프트는 한 번만 뜬다. 이미 요청했으면 설정 창으로 보내는 것이 유일한 복구다. */}
          {requested ? (
            <Button size="lg" onClick={() => void openSettings()}>
              시스템 설정 열기
            </Button>
          ) : (
            <Button size="lg" loading={busy} onClick={() => void request()}>
              권한 허용하기
            </Button>
          )}
          <Button variant="ghost" size="md" onClick={goHome}>
            나중에 하기
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[12px] text-text-secondary">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          권한 없이도 파일 업로드로 분석할 수 있습니다. 캡처를 쓸 때 다시 안내합니다.
        </p>
      </section>
    </main>
  );
}
