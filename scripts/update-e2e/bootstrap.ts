import { invoke } from "@tauri-apps/api/core";

const trace = (stage: string) => invoke("e2e_trace", { stage });
window.addEventListener("error", (event) => {
  void trace(`bootstrap-error: ${event.message}`);
});
window.addEventListener("unhandledrejection", (event) => {
  void trace(`bootstrap-rejection: ${String(event.reason)}`);
});
await trace("webview-entry");
await import("./main");
await trace("main-module-complete");
