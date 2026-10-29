import { useState, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { apiFetch } from "@/shared/api/client";
import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/Button";
import { useInstallationStore } from "./installationStore";
import { useAcquisitionStore } from "./acquisitionStore";
import { useAcquisitionChoiceStore } from "./acquisitionChoiceStore";

const endpoint = "/v1/installations/current/acquisition";
let automaticLink: Promise<void> = Promise.resolve();
export function AcquisitionConsent() {
  const { pending, clear } = useAcquisitionStore();
  const status = useInstallationStore((s) => s.status);
  const installationId = useInstallationStore((s) => s.credentials?.installationId);
  const choices = useAcquisitionChoiceStore();
  const mode = choices.mode(installationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!pending || status !== "registered" || mode === "unset") return;
    clear();
    if (mode === "deny") return;
    automaticLink = automaticLink
      .then(async () => {
        if (useAcquisitionChoiceStore.getState().mode(installationId) !== "allow") return;
        await apiFetch(endpoint, {
          method: "POST",
          auth: false,
          body: { creative: pending, version: "2026-10-29", consent: true },
        });
        useAcquisitionChoiceStore.setState({ error: "" });
      })
      .catch(() => {
        useAcquisitionChoiceStore.setState({
          error:
            "광고 연결을 완료하지 못했습니다. 첫 실행 24시간 이내의 새 설치만 연결할 수 있습니다. 앱 이용은 계속할 수 있습니다.",
        });
      });
  }, [pending, status, mode, clear, installationId]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const receive = (urls: string[]) => {
      if (!disposed) urls.forEach((url) => useAcquisitionStore.getState().receive(url));
    };
    void import("@tauri-apps/plugin-deep-link")
      .then(async ({ onOpenUrl, getCurrent }) => {
        const unlisten = await onOpenUrl(receive);
        if (disposed) {
          unlisten();
          return;
        }
        stop = unlisten;
        const initial = await getCurrent();
        if (initial) receive(initial);
      })
      .catch(() => {
        /* Optional handoff must not prevent app startup. */
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  async function agree() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(endpoint, {
        method: "POST",
        auth: false,
        body: { creative: pending, version: "2026-10-29", consent: true },
      });
      if (installationId) choices.record(installationId, true);
      clear();
    } catch {
      setError(
        "광고 연결을 완료하지 못했어요. 첫 실행 24시간 이내의 새 설치만 연결할 수 있습니다. 연결하지 않아도 앱을 이용할 수 있어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={Boolean(pending) && status === "registered" && mode === "unset"}
      onClose={() => {
        if (!busy) {
          clear();
          setError("");
        }
      }}
      title="어떤 광고가 도움이 되었는지 알려주세요"
    >
      <p className="text-sm text-text-primary">
        {pending === "meta-poster-a" ? "포스터 A" : "영상 A"}에서 온 링크로 앱을 열었습니다.
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        선택 동의하면 Standin이 광고 구분값, 이 설치의 식별자, 동의 시각을 연결하여 이후 활성
        이용·분석 성공·후보 선택·저장 완료 여부를 최대 90일간 집계합니다. Google·Meta에 앱 이용
        기록을 보내지 않습니다. 원고 내용은 광고 측정에 사용하지 않습니다.
      </p>
      <p className="mt-3 text-sm text-text-secondary">
        거절해도 이용에 불이익이 없습니다. 설정의 ‘광고 유입 연결 해제’에서 철회할 수 있습니다.
        철회·만료 후에는 광고 구분값을 삭제하며, 재연결 방지용 동의 시각은 설치 기록이 삭제될 때까지
        남습니다. 문의: standin.asm@gmail.com
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
            if (installationId) choices.record(installationId, false);
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
export function AcquisitionSettings() {
  const installationId = useInstallationStore((s) => s.credentials?.installationId);
  const choices = useAcquisitionChoiceStore();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function revoke() {
    setBusy(true);
    setMessage("");
    if (installationId) choices.record(installationId, false);
    useAcquisitionStore.getState().clear();
    try {
      // Finish an already-authorized handoff before deleting, so a late POST cannot restore it.
      await automaticLink;
      await apiFetch(endpoint, { method: "DELETE", auth: false });
      useAcquisitionStore.getState().clear();
      setMessage("광고와 이 설치의 연결을 해제했습니다.");
    } catch {
      setMessage("연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 className="text-[15px] font-bold text-text-primary">광고 유입 측정</h2>
      <p className="my-3 text-sm text-text-secondary">
        첫 실행 화면 또는 앱 열기 안내에서 선택한 광고 연결을 해제합니다. 앱과 작업 기록은 계속
        이용할 수 있습니다.
      </p>
      {choices.error && (
        <p role="alert" className="my-3 text-sm text-brand-coral">
          {choices.error}
        </p>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => void revoke()}>
        광고 유입 연결 해제
      </Button>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </section>
  );
}
