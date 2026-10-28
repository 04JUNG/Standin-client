import { router } from "@/app/router";
import { record } from "@rrweb/record";
import { replayObservation, observeReplay } from "@/shared/lib/replayBridge";
import { replayConfig } from "./config";
import { replayActive, replayGap, sendReplayEvents, finishReplay } from "./client";
import { safeReplayText } from "./privacy";
type Surface = "app" | "bar" | "capture";
type TimedEvent = { type: number; timestamp: number; data: unknown };
const surfaceAt = (): Surface =>
  location.pathname.includes("/capture")
    ? "capture"
    : location.pathname.startsWith("/bar")
      ? "bar"
      : "app";
export function startRecorder() {
  let stop: (() => void) | undefined;
  let surface = surfaceAt();
  let buffer: TimedEvent[] = [];
  let bytes = 0;
  let links: {
    jobId?: string;
    inputAttemptId?: string;
    attemptId?: string;
    feature?: string;
    screen?: string;
    failed?: boolean;
    saveState?: string;
  } = {};
  let lastRoute = "";
  const flush = () => {
    if (buffer.length) sendReplayEvents(surface, buffer, links);
    buffer = [];
    bytes = 0;
  };
  const emit = (event: TimedEvent) => {
    if (!replayActive()) return;
    const size = JSON.stringify(event).length;
    if (size > 900_000) {
      replayGap("snapshot_too_large");
      return;
    }
    if (bytes + size > 240_000 && buffer.length) flush();
    buffer.push(event);
    bytes += size;
  };
  const custom = (tag: string, payload: Record<string, unknown>, jobId?: string) => {
    if (!stop || !replayActive()) return;
    if (tag === "input_started") {
      flush();
      links = { screen: links.screen };
    }
    if (jobId && links.jobId !== jobId) {
      flush();
      links = { ...links, jobId };
    }
    const input =
      payload.inputAttemptId ?? (tag === "input_started" ? payload.attemptId : undefined);
    if (typeof input === "string") links.inputAttemptId = input;
    if (typeof payload.attemptId === "string") links.attemptId = payload.attemptId;
    if (typeof payload.feature === "string") links.feature = payload.feature;
    if (tag.endsWith("failed")) links.failed = true;
    if (tag === "export_completed") links.saveState = "saved";
    emit({
      type: 5,
      timestamp: Date.now(),
      data: { tag, payload: { ...payload, ...(jobId ? { jobId } : {}) } },
    });
  };
  const unsubscribe = observeReplay(custom);
  const synchronize = () => {
    const route = router.state.location.pathname;
    const allowed =
      replayActive() &&
      /^\/(?:app|bar)(?:\/|$)/.test(route) &&
      (!route.includes("capture") || replayConfig().captureEnabled);
    if (!allowed) {
      if (stop) {
        stop();
        stop = undefined;
        flush();
      }
      return;
    }
    const next = surfaceAt();
    if (next !== surface || route !== lastRoute) {
      stop?.();
      stop = undefined;
      flush();
      surface = next;
      lastRoute = route;
      links = {
        ...links,
        screen: route
          .replace(/[a-f0-9-]{32,36}/gi, "job")
          .replace(/[^a-zA-Z0-9_.:-]/g, "_")
          .slice(0, 128),
      };
    }
    if (!stop) {
      // Capture has its own restricted reconstruction. Its full desktop DOM is never serialized.
      if (surface === "capture") {
        stop = () => {};
        custom("surface", { surface, visible: !document.hidden });
        return;
      }
      try {
        stop =
          record({
            emit: (event) => emit(event as TimedEvent),
            checkoutEveryNms: 30_000,
            inlineStylesheet: true,
            inlineImages: false,
            recordCanvas: false,
            collectFonts: false,
            recordCrossOriginIframes: false,
            blockSelector:
              '[data-replay-private], .rr-block, video, audio, iframe, canvas, input[type="password"]',
            maskAllInputs: true,
            maskInputFn: (text, element) =>
              element?.matches('[data-replay-search="true"]')
                ? safeReplayText(text).slice(0, 500)
                : "*".repeat(Math.min(text.length, 64)),
            maskTextSelector: '[data-replay-mask], [title*="/"], [title*="\\\\"]',
            maskTextFn: () => "[private]",
            slimDOMOptions: "all",
            sampling: { mousemove: 100, scroll: 150, input: "last" },
            errorHandler: () => {
              replayGap("recorder_error");
              return true;
            },
          }) || undefined;
        custom("surface", {
          surface,
          route: route.replace(/[a-f0-9-]{32,36}/gi, ":id"),
          visible: !document.hidden,
          width: innerWidth,
          height: innerHeight,
          devicePixelRatio,
        });
      } catch {
        replayGap("recorder_unavailable");
      }
    }
  };
  const unsubscribeRoute = router.subscribe(synchronize);
  const tick = setInterval(synchronize, 200);
  const chunk = setInterval(flush, 5000);
  const visibility = () => {
    replayObservation("visibility", { visible: !document.hidden, focused: document.hasFocus() });
    flush();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", visibility);
  window.addEventListener("focus", visibility);
  const closing = () => {
    flush();
    void finishReplay().catch(() => {});
  };
  window.addEventListener("pagehide", closing);
  synchronize();
  return () => {
    unsubscribeRoute();
    clearInterval(tick);
    clearInterval(chunk);
    unsubscribe();
    stop?.();
    flush();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", visibility);
    window.removeEventListener("focus", visibility);
    window.removeEventListener("pagehide", closing);
  };
}
