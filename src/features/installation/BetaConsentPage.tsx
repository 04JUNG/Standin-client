import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/Button";
import { windowModeService } from "@/features/bar/api/windowMode.service";
import { useInstallationStore } from "./installationStore";

export function BetaConsentPage() {
  const navigate = useNavigate();
  const status = useInstallationStore((state) => state.status);
  const error = useInstallationStore((state) => state.error);
  const register = useInstallationStore((state) => state.register);
  const [accepted, setAccepted] = useState(false);

  if (status === "registered") return <Navigate to="/app/home" replace />;

  async function submit() {
    await register();
    if (useInstallationStore.getState().status === "registered") navigate("/app/home", { replace: true });
  }

  /**
   * 거부하면 앱을 닫는다. 동의 없이 쓸 수 있는 화면이 없으므로 이 버튼이 없으면
   * "거부할 수 있다"는 안내가 실제로 거부할 방법 없는 문구가 된다.
   */
  function decline() {
    void windowModeService.control("close");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-paper p-6">
      <section className="w-full max-w-[640px] rounded-2xl border border-border bg-surface-0 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-text-primary">Standin 클로즈베타 데이터 수집 동의</h1>
        <div className="mt-5 space-y-4 text-sm leading-6 text-text-secondary">
          <p>
            포즈 검색 품질과 사용 흐름을 개선하기 위해 분석에 제출한 캡처·러프 원본,
            2D 스켈레톤, 노출 후보, 선택·저장 결과를 수집합니다.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>원본 이미지는 암호화된 비공개 저장소에 90일 보관합니다.</li>
            <li>연결 가능한 스켈레톤·후보·행동 데이터는 1년 보관합니다.</li>
            <li>
              어느 화면에서 무엇을 했는지와 분석·캡처·저장 실패 기록을 함께 수집합니다.
              오류 분류 코드만 남기며 파일 내용은 포함하지 않습니다.
            </li>
            <li>MAC 주소, 디스크 ID, 호스트명, 로컬 파일 경로는 수집하지 않습니다.</li>
            <li>설정에서 동의를 철회하고 연결 데이터 삭제를 요청할 수 있습니다.</li>
          </ul>
          <p>
            동의를 거부할 수 있으나, 데이터 수집이 목적인 클로즈베타에는 참여할 수 없습니다.
            본인이 이용 권한을 가진 이미지와 캡처만 제출해 주세요.
          </p>
        </div>
        <label className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1"
          />
          위 수집 목적, 항목, 보유기간 및 거부 시 제한을 확인하고 동의합니다.
        </label>
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
            {status === "initializing" ? "등록 중…" : "동의하고 베타 시작"}
          </Button>
          <Button variant="ghost" size="md" onClick={decline}>
            동의하지 않고 종료
          </Button>
        </div>
      </section>
    </main>
  );
}
