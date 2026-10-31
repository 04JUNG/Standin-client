import { create } from "zustand";
import { prepareInstallerCampaign } from "@/features/installation/installerCampaign";
import { trackEvent } from "@/features/analytics/analyticsClient";
import { safeStorage } from "@/shared/lib/safeStorage";
import { updateService } from "../api/update.service";
import type { CachedUpdate, UpdateAvailability } from "../api/update.contract";
import { updateFailureReason, updateFailureMessage } from "../lib/updateFailure";

type CheckPhase = "idle" | "checking" | "done" | "error";
type InstallPhase = "idle" | "downloading" | "ready" | "installing" | "restarting";
type Trigger = "startup" | "manual" | "periodic" | "reconnect";
const NORMAL_INTERVAL = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;
const INSTALL_ATTEMPT = "standin.updates.installAttempt";

type UpdateState = {
  version: string | null;
  configured: boolean | null;
  phase: CheckPhase;
  result: UpdateAvailability | null;
  error: string | null;
  installPhase: InstallPhase;
  ratio: number | null;
  cached: CachedUpdate | null;
  startupComplete: boolean;
  bannerDismissed: boolean;
  nextCheckAt: number;
  loadInfo(): Promise<void>;
  bootstrap(): Promise<void>;
  check(trigger: Trigger): Promise<void>;
  install(blockReason: () => string | null): Promise<void>;
  dismissBanner(): void;
  reset(): void;
};

const initial = {
  version: null,
  configured: null,
  phase: "idle",
  result: null,
  error: null,
  installPhase: "idle",
  ratio: null,
  cached: null,
  startupComplete: false,
  bannerDismissed: false,
  nextCheckAt: 0,
} satisfies Omit<
  UpdateState,
  "loadInfo" | "bootstrap" | "check" | "install" | "dismissBanner" | "reset"
>;

let infoPromise: Promise<void> | null = null;
let bootstrapPromise: Promise<void> | null = null;

/** Confirm success only after the newly installed binary actually starts. */
export function reportInstalledUpdate(version: string, analyticsEnabled: boolean) {
  try {
    const attempt = JSON.parse(safeStorage.getItem(INSTALL_ATTEMPT) ?? "null") as {
      fromVersion?: string;
      toVersion?: string;
    } | null;
    if (attempt?.toVersion === version && attempt.fromVersion !== version) {
      if (analyticsEnabled) {
        trackEvent("update_installed", {
          fromVersion: attempt.fromVersion ?? null,
          toVersion: version,
        });
      }
      safeStorage.removeItem(INSTALL_ATTEMPT);
    }
  } catch {
    safeStorage.removeItem(INSTALL_ATTEMPT);
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...initial,
  async loadInfo() {
    if (get().configured !== null) return;
    if (!infoPromise) {
      infoPromise = (async () => {
        const [version, configured] = await Promise.all([
          updateService.currentVersion().catch(() => null),
          updateService.isConfigured().catch(() => false),
        ]);
        set({ version, configured });
      })();
    }
    await infoPromise;
  },

  async bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        // Preserve a fresh package's shared campaign label before a cached generic update runs.
        await prepareInstallerCampaign();
        await get().loadInfo();
        if (!get().configured) {
          set({ startupComplete: true });
          return;
        }
        try {
          const cached = await updateService.cached();
          if (cached) {
            set({
              cached,
              installPhase: "ready",
              result: { kind: "available", ...cached },
              phase: "done",
            });
            if (!cached.attempted) {
              // Children have not mounted: capture/jobs/shortcuts cannot start here.
              await get().install(() => null);
              if (get().installPhase === "restarting") return;
            }
          }
        } catch (error) {
          set({ error: updateFailureMessage(error, "install") });
        }
        set({ startupComplete: true });
        // Failed install is shown in Settings; don't immediately repeat its network request.
        if (!get().error) void get().check("startup");
      })();
    }
    await bootstrapPromise;
  },

  async check(trigger) {
    await get().loadInfo();
    if (
      !get().configured ||
      get().phase === "checking" ||
      ["downloading", "installing", "restarting"].includes(get().installPhase)
    )
      return;
    if (trigger !== "manual" && Date.now() < get().nextCheckAt) return;
    const previous = get().result;
    const previousVersion = previous?.kind === "available" ? previous.version : null;
    set({ phase: "checking", error: null, nextCheckAt: Date.now() + NORMAL_INTERVAL });
    let failurePhase: "check" | "download" = "check";
    try {
      const result = await updateService.check();
      set({ phase: "done", result });
      trackEvent("update_check", { trigger, result: result.kind });
      if (result.kind !== "available") {
        set({ cached: null, installPhase: "idle" });
        return;
      }
      failurePhase = "download";
      set({
        cached: get().cached?.version === result.version ? get().cached : null,
        installPhase: "downloading",
        ratio: null,
        bannerDismissed: result.version === previousVersion ? get().bannerDismissed : false,
      });
      const cached = await updateService.download(({ ratio }) => set({ ratio }));
      set({ cached, installPhase: "ready", ratio: 1 });
    } catch (error) {
      set({
        phase: failurePhase === "check" ? "error" : "done",
        installPhase: get().cached ? "ready" : "idle",
        error: updateFailureMessage(error, failurePhase),
        nextCheckAt: Date.now() + RETRY_INTERVAL,
      });
      if (failurePhase === "check") trackEvent("update_check", { trigger, result: "error" });
      trackEvent("update_failed", { phase: failurePhase, reason: updateFailureReason(error) });
    }
  },

  async install(blockReason) {
    if (get().installPhase !== "ready" || get().phase === "checking" || !get().cached) return;
    const reason = blockReason();
    if (reason) {
      set({ error: reason });
      return;
    }
    const cached = get().cached!;
    set({ installPhase: "installing", error: null });
    safeStorage.setItem(
      INSTALL_ATTEMPT,
      JSON.stringify({ fromVersion: get().version, toVersion: cached.version }),
    );
    try {
      await updateService.install();
      set({ installPhase: "restarting" });
      await updateService.relaunch();
    } catch (error) {
      set({
        installPhase: "ready",
        cached: { ...cached, attempted: true },
        error: updateFailureMessage(error, "install"),
        nextCheckAt: Date.now() + RETRY_INTERVAL,
      });
      trackEvent("update_failed", { phase: "install", reason: updateFailureReason(error) });
    }
  },
  dismissBanner: () => set({ bannerDismissed: true }),
  reset() {
    infoPromise = null;
    bootstrapPromise = null;
    set({ ...initial });
  },
}));

export function pendingUpdate(
  state: UpdateState,
): { version: string; notes?: string | null } | null {
  if (state.bannerDismissed || state.result?.kind !== "available") return null;
  return { version: state.result.version, notes: state.result.notes };
}
