// A test entry point around real updater/store/dialog code. Not imported by src/main.tsx.
/* eslint-disable react-refresh/only-export-components -- Dedicated integration entry point. */
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useUpdateStore } from "@/features/updates/store/updateStore";
import { updateService } from "@/features/updates/api/update.service";
import { useStartupUpdateCheck } from "@/features/updates/hooks/useStartupUpdateCheck";
import { updateBlockReason } from "@/features/updates/hooks/useUpdateBlockReason";
import { ReleaseNotesDialog } from "@/features/updates/components/ReleaseNotesDialog";
import { AppUpdateSection } from "@/features/updates/components/AppUpdateSection";
import { useReleaseNotesStore, SEEN_RELEASE_KEY } from "@/features/updates/lib/releaseNotes";
import { useInstallationStore } from "@/features/installation/installationStore";
import { useTourStore } from "@/shared/stores/tourStore";
import { useCaptureStore } from "@/features/capture/store/captureStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import "@/app/styles/index.css";

type Control = { scenario: string; a: string; b: string };
const control = await invoke<Control>("e2e_control");
await invoke("e2e_trace", { stage: "control-received" });
const client = new QueryClient();
const report = (type: string, detail: unknown = null) =>
  invoke("e2e_report", { event: { scenario: control.scenario, type, detail } });
// Product copy intentionally hides native diagnostics. Keep real rejections in
// this QA entry point so signature checks do not depend on translated UI text.
const nativeFailures: { phase: string; message: string }[] = [];
function observeFailure<Args extends unknown[], Result>(
  phase: string,
  operation: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args): Promise<Result> => {
    try {
      return await operation(...args);
    } catch (error) {
      const failure = { phase, message: error instanceof Error ? error.message : String(error) };
      nativeFailures.push(failure);
      await report("native-update-failure", failure);
      throw error;
    }
  };
}
updateService.check = observeFailure("check", updateService.check);
updateService.download = observeFailure("download", updateService.download);
updateService.install = observeFailure("install", updateService.install);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate: () => boolean, timeout = 90_000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for updater state");
    await pause(100);
  }
};
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const state = () => useUpdateStore.getState();
const dialog = () => document.querySelector('[role="dialog"]');
const closeDialog = () => {
  const button = Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "확인",
  );
  assert(button, "Dialog confirmation button missing");
  button!.click();
};

// Backend consent and onboarding are test fixtures; no credentials or production
// requests are used. The real native updater and persisted release history remain intact.
useInstallationStore.setState({ status: "registered" });
useTourStore.getState().dismiss();
if (!localStorage.getItem(SEEN_RELEASE_KEY)) localStorage.setItem(SEEN_RELEASE_KEY, control.a);

function Harness() {
  useStartupUpdateCheck();
  const s = useUpdateStore();
  return (
    <main className="p-8">
      <h1>Signed updater verification: {control.scenario}</h1>
      <p role="status">
        {s.version} / {s.installPhase} / {s.error}
      </p>
      {s.startupComplete && !["installing", "restarting"].includes(s.installPhase) && (
        <>
          <AppUpdateSection />
          <ReleaseNotesDialog />
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

window.addEventListener("error", (event) => {
  void report("error", event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  void report("error", String(event.reason));
});
await report("launched");
let lastState = "";
useUpdateStore.subscribe((s) => {
  const detail = {
    version: s.version,
    startupComplete: s.startupComplete,
    phase: s.phase,
    installPhase: s.installPhase,
    error: s.error,
    cached: s.cached && { version: s.cached.version, attempted: s.cached.attempted },
  };
  const serialized = JSON.stringify(detail);
  if (serialized !== lastState) {
    lastState = serialized;
    void report("state", detail);
  }
});

try {
  await waitFor(() => Boolean(state().version));
  if (control.scenario === "upgrade" && state().version === control.a) {
    // Windows installer exits this process; macOS relaunch replaces it.
    await waitFor(() => false, 180_000);
  }
  await waitFor(() => state().startupComplete);
  switch (control.scenario) {
    case "startup":
      assert(Boolean(document.querySelector('[role="status"]')), "React UI did not mount");
      await report("startup-ready");
      break;
    case "reject-signature":
      await waitFor(() => Boolean(state().error));
      assert(
        nativeFailures.some(
          (failure) =>
            ["check", "download"].includes(failure.phase) &&
            /signature|base64|decode/i.test(failure.message),
        ),
        "Expected native signature rejection",
      );
      assert(!state().cached, "Unverified download must not be cached");
      break;
    case "download":
    case "recover":
      await waitFor(
        () =>
          state().phase === "done" &&
          state().installPhase === "ready" &&
          state().cached?.attempted === false,
      );
      assert(state().version === control.a, "Must not install during an active session");
      assert(state().cached?.version === control.b, "Expected B in durable cache");
      if (control.scenario === "download") {
        for (const kind of ["capture", "save", "unsaved"] as const) {
          if (kind === "capture") useCaptureStore.setState({ status: "processing" });
          if (kind === "save") useExportStore.setState({ status: "saving" });
          if (kind === "unsaved")
            usePoseSelectionStore.setState({ jobId: "e2e", selectedByPerson: { 0: "pose" } });
          await state().install(() => updateBlockReason(client));
          assert(
            state().installPhase === "ready" && state().error,
            `${kind} work was not protected`,
          );
          await report("work-protected", kind);
          useCaptureStore.getState().reset();
          useExportStore.getState().reset();
          usePoseSelectionStore.getState().clearSelection();
        }
      }
      break;
    case "offline":
    case "tamper":
      assert(state().version === control.a, "Failed install must retain A");
      assert(state().error, "Expected install failure");
      if (control.scenario === "tamper")
        assert(
          nativeFailures.some(
            (failure) => failure.phase === "install" && /signature/i.test(failure.message),
          ),
          "Tampered bytes were not rejected by the native installer",
        );
      break;
    case "upgrade":
      assert(state().version === control.b, "New binary must actually run");
      await waitFor(() => Boolean(dialog()));
      assert(
        dialog()!.textContent?.includes(`${control.b} 업데이트 완료`),
        "Missing completion popup",
      );
      await report("popup", dialog()!.textContent);
      closeDialog();
      await waitFor(() => !dialog());
      assert(localStorage.getItem(SEEN_RELEASE_KEY) === control.b, "Seen version not persisted");
      // WebKit may not flush localStorage before immediate exit. The native
      // acknowledgement must survive even if this WebView cache is lost.
      localStorage.removeItem(SEEN_RELEASE_KEY);
      break;
    case "no-repeat":
      assert(state().version === control.b, "Expected B after relaunch");
      await pause(1800);
      assert(!dialog(), "Release popup repeated after acknowledgement");
      useReleaseNotesStore.getState().requestHistory();
      await waitFor(() => Boolean(dialog()));
      assert(dialog()!.textContent?.includes(control.b), "History is missing current release");
      await report("history", dialog()!.textContent);
      closeDialog();
      break;
    default:
      throw new Error(`Unknown scenario ${control.scenario}`);
  }
  await report("passed");
} catch (error) {
  await report("failed", String(error));
}
await invoke("e2e_exit");
