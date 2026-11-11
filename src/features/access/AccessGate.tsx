import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useInstallationStore } from "@/features/installation/installationStore";
import { apiFetch } from "@/shared/api/client";
import { messageOf } from "@/shared/api/errors";
import { env } from "@/shared/lib/env";
import { useAccessStore } from "@/shared/stores/accessStore";
import { Button } from "@/shared/components/Button";

const statusSchema = z.object({
  required: z.boolean(),
  allowed: z.boolean(),
  role: z.enum(["operator", "supporter"]).nullable(),
  codeRegistered: z.boolean().default(false),
  showBetaEndedNotice: z.boolean().default(false),
});
const accessPath = "/v1/installations/current/access";

export function AccessGate({ children }: { children: ReactNode }) {
  const registered = useInstallationStore((s) => s.status === "registered");
  const installation = useInstallationStore((s) => s.credentials?.installationId);
  const phase = useAccessStore((s) => s.phase);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(null);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const generation = useRef(0);
  const mock = env.useMockApi && !env.isProduction;
  const invalidate = useCallback(() => { generation.current++; }, []);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const status = statusSchema.parse(await apiFetch(accessPath, { auth: false, cache: "no-store" }));
      if (request !== generation.current) return;
      setStatus(status);
      useAccessStore.getState().setPhase(status.allowed ? "allowed" : "blocked");
      setError("");
    } catch {
      if (request === generation.current) useAccessStore.getState().setPhase("unavailable");
    }
  }, []);

  useEffect(() => {
    useAccessStore.getState().setPhase("unknown");
    setCode("");
    setError("");
    setStatus(null);
    setNoticeAccepted(false);
    if (!registered || mock) return;
    void refresh();
    const onFocus = () => { void refresh(); };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener("focus", onFocus);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [installation, registered, mock, refresh, invalidate]);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (redeeming || !code.trim()) return;
    setRedeeming(true);
    setError("");
    const request = ++generation.current;
    try {
      const status = statusSchema.parse(await apiFetch(accessPath + "/redeem", {
        auth: false, method: "POST", body: { code: code.trim() },
      }));
      if (request !== generation.current) return;
      setCode("");
      setStatus(status);
      useAccessStore.getState().setPhase(status.allowed ? "allowed" : "blocked");
    } catch (cause) {
      if (request === generation.current) setError(messageOf(cause, "코드를 등록하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setRedeeming(false);
    }
  }

  if (!registered || mock || phase === "allowed") return <>{children}</>;
  return (
    <main className="flex h-screen items-center justify-center overflow-y-auto bg-surface-1 p-6 text-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface-0 p-7">
        <h1 className="text-2xl font-bold">Standin</h1>
        {phase === "unknown" ? <p className="mt-5" role="status">이용 권한을 확인하고 있어요.</p> :
          phase === "unavailable" ? <>
            <p className="mt-5" role="alert">이용 권한을 확인하지 못했어요. 인터넷 연결을 확인해 주세요.</p>
            <Button className="mt-5" onClick={() => void refresh()}>다시 확인</Button>
          </> : status?.codeRegistered ? <>
            <h2 className="mt-5 text-lg font-semibold">이용 권한이 종료되었습니다</h2>
            <p className="mt-2 text-sm text-text-secondary">이용 권한을 확인하려면 운영자에게 문의해 주세요.</p>
            <Button variant="secondary" className="mt-5 w-full" onClick={() => void refresh()}>이용 권한 다시 확인</Button>
          </> : status?.showBetaEndedNotice && !noticeAccepted ? <>
            <h2 className="mt-5 text-lg font-semibold">오픈베타가 종료되었습니다</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">지금까지 Standin 오픈베타에 함께해 주셔서 감사합니다. 보내주신 의견을 바탕으로 더 나은 서비스를 준비하겠습니다.</p>
            <Button className="mt-6 w-full" onClick={() => setNoticeAccepted(true)}>확인</Button>
          </> : <>
            <h2 className="mt-5 text-lg font-semibold">이용 코드 등록</h2>
            <p className="mt-2 text-sm text-text-secondary">전달받은 이용 코드를 입력해 주세요.</p>
            <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void redeem(event)}>
              <label htmlFor="access-code" className="text-sm font-medium">이용 코드</label>
              <input id="access-code" type="text" value={code} maxLength={100} autoComplete="off"
                spellCheck={false} placeholder="전달받은 코드 입력" disabled={redeeming}
                onChange={(event) => setCode(event.target.value)}
                className="rounded-lg border border-border bg-surface-0 px-3 py-3" />
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={redeeming || !code.trim()}>
                {redeeming ? "등록 중…" : "코드 등록"}
              </Button>
            </form>
            <Button variant="secondary" className="mt-3 w-full" disabled={redeeming}
              onClick={() => void refresh()}>이용 권한 다시 확인</Button>
          </>}
      </section>
    </main>
  );
}
