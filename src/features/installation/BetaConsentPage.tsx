import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/Button";
import { windowModeService } from "@/features/bar/api/windowMode.service";
import { captureService } from "@/features/capture/api/capture.service";
import { useInstallationStore } from "./installationStore";
import { QualityConsentFields } from "./QualityConsentFields";
import type { QualityChoices } from "./qualityConsentStore";
import { env } from "@/shared/lib/env";
import { openExternal } from "@/shared/lib/openExternal";

export function BetaConsentPage() {
  const navigate = useNavigate();
  const status = useInstallationStore((state) => state.status);
  const error = useInstallationStore((state) => state.error);
  const register = useInstallationStore((state) => state.register);
  const [accepted, setAccepted] = useState(false);
  const [quality, setQuality] = useState<QualityChoices>({
    personalData: false,
    contentLicense: false,
  });

  if (status === "registered") return <Navigate to="/app/home" replace />;

  async function submit() {
    await register(quality);
    if (useInstallationStore.getState().status !== "registered") return;

    // macOS 화면 기록 권한은 켠 뒤 앱을 다시 실행해야 반영된다. 첫 캡처 시점에 요구하면
    // 작가가 캡처하려는 순간에 앱을 껐다 켜게 만드므로, 잃을 작업이 없는 지금 물어본다
    // (ADR-003 2026-08-28 정정). 권한이 있거나 Windows면 이 단계는 건너뛴다.
    const permission = await captureService.screenPermissionStatus();
    navigate(permission === "denied" ? "/app/screen-permission" : "/app/home", { replace: true });
  }

  function decline() {
    void windowModeService.control("close");
  }

  return (
    <main className="h-full overflow-y-auto bg-brand-paper p-6">
      <section className="mx-auto w-full max-w-[640px] rounded-2xl border border-border bg-surface-0 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-text-primary">Standin 오픈베타 시작하기</h1>
        <div className="mt-5 space-y-4 text-sm leading-6 text-text-secondary">
          <p>
            분석을 요청하면 선택한 이미지가 서버와 외부 AI 제공자에게 전송됩니다. 기본 분석용 원본은
            업로드 후 최대 90일 또는 개별·전체 삭제 요청 처리 시점 중 먼저 도래하는 때까지
            보관합니다. 작업 결과와 이력도 최대 90일 보관하며 원본의 만료일을 연장하지 않습니다.
          </p>
          <p>
            품질 검토에 동의하지 않아도 기본 분석·내보내기를 이용할 수 있으며, 담당자의 품질
            검토에는 사용하지 않습니다. 이용 권한이 있는 이미지만 제출해 주세요.
          </p>
          <div className="flex flex-wrap gap-4">
            {[
              ["terms", "이용약관"],
              ["content-license", "콘텐츠 라이선스"],
              ["privacy", "개인정보처리방침"],
              ["beta", "오픈베타 운영정책"],
            ].map(([slug, label]) => (
              <button
                key={slug}
                type="button"
                className="underline underline-offset-2"
                onClick={() => void openExternal(`${env.webBaseUrl}/legal/${slug}/`)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1"
          />
          [필수] 이용약관·콘텐츠 라이선스 약관에 동의하고 기본 서비스 처리 안내를 확인했습니다.
        </label>
        <div className="mt-5">
          <QualityConsentFields
            value={quality}
            onChange={setQuality}
            disabled={status === "initializing"}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-brand-coral">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            size="lg"
            disabled={!accepted || status === "initializing"}
            onClick={() => void submit()}
          >
            {status === "initializing" ? "등록 중…" : "베타 시작"}
          </Button>
          <Button variant="ghost" size="md" onClick={decline}>
            종료
          </Button>
        </div>
      </section>
    </main>
  );
}
