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
import { AcquisitionConsentFields } from "./AcquisitionConsentFields";

export function BetaConsentPage() {
  const navigate = useNavigate();
  const status = useInstallationStore((state) => state.status);
  const error = useInstallationStore((state) => state.error);
  const register = useInstallationStore((state) => state.register);
  const [accepted, setAccepted] = useState(false);
  const [acquisition, setAcquisition] = useState(false);
  const [quality, setQuality] = useState<QualityChoices>({
    personalData: false,
    contentLicense: false,
  });

  if (status === "registered") return <Navigate to="/app/home" replace />;

  async function submit(all = false) {
    if (all) {
      setAccepted(true);
      setQuality({ personalData: true, contentLicense: true });
      setAcquisition(true);
    }
    await register(
      all ? { personalData: true, contentLicense: true } : quality,
      all || acquisition,
    );
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
        <aside
          className="mt-5 rounded-xl bg-surface-1 p-4 text-sm leading-6 text-text-secondary"
          aria-label="소재별 건수 통계 안내"
        >
          <p className="font-bold text-text-primary">소재별 건수 통계 안내</p>
          <p className="mt-2">
            광고 랜딩에서 받은 전용 설치 파일은 포스터·영상 구분을 포함하므로, 새로 설치해 그냥
            실행해도 등록 후 첫 실행·첫 이미지 분석 성공 건수를 선택 동의와 별개로 집계합니다. 일반
            설치 파일은 등록 후 24시간 안에 광고의 앱 열기 링크를 누른 경우에만 구분합니다.
            설치·작업 식별자, 원고, 쿠키는 이 집계에 보내지 않으며 Google·Meta에도 보내지 않습니다.
            서버에는 날짜·소재·이벤트별 합계만 최대 90일 보관합니다. 설치 파일의 소재 구분은 등록
            전에는 첫 실행부터 최대 7일, 등록 후에는 첫 분석 성공 또는 등록 후 7일까지 보관하고 만료
            후 다음 실행 시 삭제합니다.
          </p>
          <p className="mt-2">
            설치별 이용 이력을 광고와 연결하는 아래 선택 항목과는 별개입니다. 이미 합산한 건수는
            개인을 구분할 수 없어 개별 삭제할 수 없습니다. 자세한 처리 범위는{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() =>
                void openExternal(`${env.webBaseUrl}/legal/measurement/#campaign-counts`)
              }
            >
              측정 고지
            </button>
            에서 확인할 수 있습니다.
          </p>
        </aside>
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
        <div className="mt-5">
          <AcquisitionConsentFields
            value={acquisition}
            onChange={setAcquisition}
            disabled={status === "initializing"}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-brand-coral">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <p className="mb-2 text-sm leading-6 text-text-secondary">
            전체 동의에는 필수 약관과 선택 항목인 품질 검토용 개인정보·원고 이용, 설치별 광고
            유입·사용 이력 연결이 모두 포함됩니다. 필수 항목만 체크하고 아래 ‘선택한 항목만 동의하고
            시작’을 눌러도 동일한 기본 기능을 이용할 수 있습니다.
          </p>
          <Button size="lg" disabled={status === "initializing"} onClick={() => void submit(true)}>
            전체 동의하고 시작
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={!accepted || status === "initializing"}
            onClick={() => void submit()}
          >
            {status === "initializing" ? "등록 중…" : "선택한 항목만 동의하고 시작"}
          </Button>
          <Button variant="ghost" size="md" onClick={decline}>
            종료
          </Button>
        </div>
      </section>
    </main>
  );
}
