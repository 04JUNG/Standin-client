import { env } from "@/shared/lib/env";
import { isTauri } from "@tauri-apps/api/core";

type Creative = "meta-poster-a" | "meta-hook-a";
type CountEvent = "first_run" | "first_analysis_success";
type State = {
  v: 1;
  eligibleUntil: number;
  expiresAt: number;
  creative: Creative | null;
  firstSent: boolean;
  successSent: boolean;
};
const KEY = "standin.campaign-counts.v1";
const DAY = 86400000;
const creativeOf = (v: unknown): v is Creative => v === "meta-poster-a" || v === "meta-hook-a";

/** Local first-event suppression, not a user identifier or an authenticated analytics client. */
export function createCampaignCounter(options: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  send: (value: { v: 1; creative: Creative; event: CountEvent }) => Promise<unknown>;
  enabled: boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const started = new Set<string>(); // Only current-process jobs; never sent with the counter.
  function clear() {
    started.clear();
    try {
      options.storage.removeItem(KEY);
    } catch {
      /* Counts must not block app use. */
    }
  }
  function read(): State | null {
    try {
      const s = JSON.parse(options.storage.getItem(KEY) ?? "null") as State | null;
      if (!s) return null;
      if (
        s.v !== 1 ||
        !Number.isFinite(s.eligibleUntil) ||
        !Number.isFinite(s.expiresAt) ||
        s.eligibleUntil > now() + DAY ||
        s.expiresAt > now() + 7 * DAY ||
        s.expiresAt <= now() ||
        s.expiresAt !== s.eligibleUntil + 6 * DAY ||
        (s.creative !== null && !creativeOf(s.creative)) ||
        typeof s.firstSent !== "boolean" ||
        typeof s.successSent !== "boolean"
      ) {
        clear();
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }
  function save(s: State) {
    try {
      options.storage.setItem(KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  }
  function sendOnce(s: State, event: CountEvent) {
    if (!options.enabled || !s.creative) return;
    const creative = s.creative;
    if (event === "first_run") {
      if (s.firstSent) return;
      s.firstSent = true;
    } else {
      if (!s.firstSent || s.successSent) return;
      s.successSent = true;
      s.creative = null; // No longer needed after the first success.
    }
    // Reserve before sending. Never retry an ambiguous network result and double-count it.
    if (!save(s)) return;
    try {
      void options.send({ v: 1, creative, event }).catch(() => undefined);
    } catch {
      /* Optional counters must never interrupt registration or analysis. */
    }
  }
  function receive(creative: Creative) {
    if (!options.enabled || !creativeOf(creative)) return;
    const s = read();
    if (!s || s.successSent || s.creative || now() > s.eligibleUntil) return;
    s.creative = creative;
    sendOnce(s, "first_run");
  }
  return {
    initializeNewRegistration(creative: Creative | null) {
      if (!options.enabled) return;
      const time = now();
      // Called only after a new registration and the first-run notice, never on an upgrade.
      if (
        save({
          v: 1,
          eligibleUntil: time + DAY,
          expiresAt: time + 7 * DAY,
          creative: null,
          firstSent: false,
          successSent: false,
        }) &&
        creative
      )
        receive(creative);
    },
    receive,
    analysisStarted(jobId: string) {
      const s = read();
      if (s?.creative && s.firstSent && !s.successSent) {
        if (started.size >= 64) started.delete(started.values().next().value!);
        started.add(jobId);
      }
    },
    analysisSucceeded(jobId: string) {
      if (!started.delete(jobId)) return;
      const s = read();
      if (s) sendOnce(s, "first_analysis_success");
    },
    clear,
    purgeExpired() {
      read();
    },
  };
}

const store = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};
export function sendCampaignCount(value: { v: 1; creative: Creative; event: CountEvent }) {
  return fetch(new URL("/v1/metrics/campaign-counts", env.apiBaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
}
export const campaignCounter = createCampaignCounter({
  storage: store,
  enabled: isTauri() && env.isProduction && !env.useMockApi && !env.useMockPoseApi,
  send: sendCampaignCount,
});
