import { useEffect, useState } from "react";
import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/Button";
import { useInstallationStore } from "./installationStore";
import { journeyClient } from "./journeyClient";
import { useJourneyHandoff } from "./journeyHandoff";

export function JourneyConsent() {
  const { token, clear } = useJourneyHandoff();
  const status = useInstallationStore((s) => s.status);
  const installation = useInstallationStore((s) => s.credentials?.installationId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    journeyClient.setInstallation(status === "registered" ? (installation ?? null) : null);
    if (status !== "registered") return;
    const refresh = () => {
      void journeyClient.refresh().catch(() => undefined);
    };
    const flush = () => {
      void journeyClient.flush();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const timer = window.setInterval(flush, 10_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.clearInterval(timer);
    };
  }, [installation, status]);
  async function agree() {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await journeyClient.claim(token);
      clear();
    } catch {
      setError(
        "연결하지 못했어요. 만료되었거나 이미 사용한 링크일 수 있습니다. 웹페이지를 새로고침해 다시 열거나, 연결 없이 계속 이용하세요. 기존 연결은 설정에서 해제할 수 있습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={Boolean(token) && status === "registered"}
      title="방문부터 앱 이용까지 연결할까요?"
      onClose={() => {
        if (!busy) {
          clear();
          setError("");
        }
      }}
    >
      <p className="text-sm text-text-secondary">
        웹에서 허용한 방문 경로와 이 설치의 이후 이용 단계를 연결하는 선택 항목입니다.
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        Standin이 웹 방문 식별자·캠페인, 설치 식별자, 동의 시각, 이후 앱 시작·입력 확정·분석
        성공/실패·결과 확인·후보 선택·저장 성공/실패 시각을 최대 90일(웹 동의 만료 시 더 일찍 종료)
        보관합니다. 다운로드 후 막히는 단계를 개선하기 위한 목적이며 Google·Meta에 앱 기록을 보내지
        않습니다. 원고·입력 문장·작업 내용은 이 경로 분석에 포함하지 않습니다.
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        거절해도 이용에 불이익이 없습니다. 연결 전 이용은 소급 연결하지 않습니다. 설정의 ‘웹
        방문·이용 경로 연결 해제’ 또는 웹 쿠키 설정에서 철회하면 연결과 경로 이벤트를 삭제합니다.
        기본 서비스 작업 이력은 별도 보유 정책을 따릅니다. 문의: standin.asm@gmail.com
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-brand-coral">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            clear();
            setError("");
          }}
        >
          연결하지 않고 계속
        </Button>
        <Button disabled={busy} onClick={() => void agree()}>
          {busy ? "연결 중…" : "동의하고 연결"}
        </Button>
      </div>
    </Modal>
  );
}
export function JourneySettings() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [linked, setLinked] = useState(Boolean(journeyClient.link()));
  useEffect(() => journeyClient.subscribe(() => setLinked(Boolean(journeyClient.link()))), []);
  async function revoke() {
    setBusy(true);
    useJourneyHandoff.getState().clear();
    try {
      await journeyClient.revoke();
      setMessage(
        "웹 방문과 앱의 연결 및 앱 경로 기록을 삭제했습니다. 웹 방문 기록도 삭제하려면 웹페이지의 쿠키 설정에서 분석 허용을 해제하세요.",
      );
    } catch {
      setMessage(
        "이 앱의 새 수집은 중단했습니다. 서버 기록 삭제는 아직 완료되지 않아 연결 복구 시 재시도합니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 className="text-[15px] font-bold text-text-primary">웹 방문·이용 경로 분석</h2>
      <p className="my-3 text-sm text-text-secondary">
        {linked
          ? "웹 방문과 이후 앱 이용 단계가 연결되어 있습니다."
          : "현재 확인된 연결이 없습니다. 네트워크 오류 시 연결 상태 확인이 늦어질 수 있습니다."}{" "}
        해제해도 기본 서비스 이용은 계속할 수 있습니다.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => void revoke()}>
        웹 방문·이용 경로 연결 해제
      </Button>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </section>
  );
}
