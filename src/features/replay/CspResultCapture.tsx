import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Button } from "@/shared/components/Button";
import { useShortcuts } from "@/shared/hooks/useShortcuts";
import { replayObservation } from "@/shared/lib/replayBridge";
import { replayFetch } from "./http";
import { useInstallationStore } from "@/features/installation/installationStore";
import { replayConfig } from "./config";
import { replayContext, replayWithdrawn, settleReplay } from "./client";
import { base64, sha256 } from "./encoding";
import { useSavedArtifacts } from "./savedArtifact";
type Target = { id: number; label: string; minimized: boolean };
const messages: Record<string, string> = {
  PERMISSION_DENIED: "화면 기록 권한을 허용한 뒤 다시 시도해 주세요.",
  TARGET_CLOSED: "선택한 창이 닫혔어요. 창을 다시 골라 주세요.",
  TARGET_MINIMIZED: "클립스튜디오 창을 펼친 뒤 다시 시도해 주세요.",
  EMPTY_FRAME: "화면을 읽지 못했어요. 결과가 보이는지 확인해 주세요.",
  FRAME_TOO_LARGE: "사진이 너무 커요. 창 크기를 줄인 뒤 다시 시도해 주세요.",
  UNSUPPORTED: "이 환경에서는 결과 사진을 보낼 수 없어요.",
};
export function CspResultCapture({ jobId }: { jobId: string }) {
  const config = replayConfig();
  const items = useSavedArtifacts((s) => s.items);
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const saved = items.filter((item) => item.jobId === jobId && item.owner === owner);
  const [targets, setTargets] = useState<Target[]>([]);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [artifactIndex, setArtifactIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [captured, setCaptured] = useState<{
    assetHash: string;
    artifactHash: string;
    snapshotVersion: string;
    jobId: string;
  } | null>(null);
  async function choose() {
    if (busy || !saved.length) return;
    setBusy(true);
    setNotice("");
    setCaptured(null);
    setOpen(true);
    setTarget("");
    try {
      const windows = await invoke<Target[]>("list_csp_windows");
      setTargets(windows);
      if (!windows.length) setNotice("클립스튜디오에서 결과를 연 뒤 다시 시도해 주세요.");
    } catch {
      setNotice(messages.UNSUPPORTED);
    } finally {
      setBusy(false);
    }
  }
  useShortcuts({
    "save.captureCspResult":
      config.cspEnabled && config.enabled && config.allowed && saved.length && isTauri()
        ? () => void choose()
        : undefined,
  });
  if (
    !config.cspEnabled ||
    !config.enabled ||
    !config.allowed ||
    !saved.length ||
    replayWithdrawn() ||
    !isTauri()
  )
    return null;
  async function capture() {
    const artifact = saved[artifactIndex];
    const ctx = replayContext();
    if (!target || !artifact || !ctx || artifact.owner !== ctx.owner) return;
    setBusy(true);
    setNotice("");
    try {
      const frame = await invoke<{ dataUrl: string; width: number; height: number }>(
        "capture_csp_result",
        { windowId: Number(target) },
      );
      if (replayContext() !== ctx || replayWithdrawn()) throw new Error("stopped");
      const blob = await (await fetch(frame.dataUrl)).blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256(bytes);
      await settleReplay();
      if (replayContext() !== ctx || replayWithdrawn()) throw new Error("stopped");
      // Success text follows the real authenticated BFF response, never a mock or an OS drag event.
      await replayFetch(`/v1/replays/${ctx.replayId}/assets/${hash}`, {
        method: "PUT",
        auth: false,
        body: {
          contentType: "image/png",
          dataBase64: base64(bytes),
          kind: "csp_result",
          jobId: artifact.jobId,
          snapshotVersion: artifact.snapshotVersion,
          artifactHash: artifact.artifactHash,
        },
      });
      if (replayContext() !== ctx || replayWithdrawn()) return;
      replayObservation(
        "csp_result_captured",
        {
          assetHash: hash,
          artifactHash: artifact.artifactHash,
          snapshotVersion: artifact.snapshotVersion,
          width: frame.width,
          height: frame.height,
          recordMode: "csp_window_image",
        },
        artifact.jobId,
      );
      setCaptured({
        assetHash: hash,
        artifactHash: artifact.artifactHash,
        snapshotVersion: artifact.snapshotVersion,
        jobId: artifact.jobId,
      });
      setNotice("결과 사진을 보냈어요.");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      setNotice(messages[code] ?? "사진을 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      data-replay-private
      className="flex flex-col gap-2 rounded border border-border p-2 text-xs"
    >
      <Button variant="secondary" size="sm" onClick={() => void choose()} disabled={busy}>
        적용 결과 보내기
      </Button>
      {open && (
        <>
          <p>결과가 보이는 클립스튜디오 창을 골라 주세요.</p>
          {saved.length > 1 && (
            <label>
              저장한 파일{" "}
              <select
                aria-label="결과를 연결할 파일"
                value={artifactIndex}
                disabled={busy}
                onChange={(e) => setArtifactIndex(Number(e.target.value))}
              >
                {saved.map((item, i) => (
                  <option key={item.artifactHash} value={i}>
                    파일 {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <select
            aria-label="클립스튜디오 창"
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">창 선택</option>
            {targets.map((window, i) => (
              <option key={window.id} value={window.id} disabled={window.minimized}>
                {window.label || `클립스튜디오 ${i + 1}`}
                {window.minimized ? " (최소화됨)" : ""}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!target || busy} onClick={() => void capture()}>
            {busy ? "보내는 중…" : "이 창 사진 보내기"}
          </Button>
          {captured && captured.jobId === jobId && (
            <label>
              어떻게 보이나요?{" "}
              <select
                aria-label="적용 결과 평가"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value)
                    replayObservation(
                      "csp_result_assessment",
                      {
                        assessment: e.target.value,
                        artifactHash: captured.artifactHash,
                        assetHash: captured.assetHash,
                        snapshotVersion: captured.snapshotVersion,
                      },
                      jobId,
                    );
                }}
              >
                <option value="">선택 안 함</option>
                <option value="good">잘 나왔어요</option>
                <option value="bad">이상해요</option>
                <option value="cannot_import">불러오지 못했어요</option>
              </select>
            </label>
          )}
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>
            닫기
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
