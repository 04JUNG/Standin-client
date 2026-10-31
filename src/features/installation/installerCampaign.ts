import { isTauri } from "@tauri-apps/api/core";
import { env } from "@/shared/lib/env";
import { installationStorage } from "./installationStorage";
import type { Creative } from "./acquisitionStore";

const KEY = "standin.installer-campaign.v1";
const LIFETIME = 7 * 86400000;
const USED = JSON.stringify({ v: 1, used: true });
export const installerCreative = (value: unknown): Creative | null =>
  value === "meta-poster-a" || value === "meta-hook-a" ? value : null;

/** Shared package label only. Capture before an update can replace the package. */
export function createInstallerCampaign(options: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  function reserve() {
    options.storage.setItem(KEY, USED); // No label, identifier or timestamp after use/expiry.
  }
  return {
    capture(value: unknown, hasRegistration: boolean) {
      try {
        if (hasRegistration) {
          options.storage.removeItem(KEY);
          return;
        }
        const previous = options.storage.getItem(KEY);
        if (previous !== null) {
          if (previous !== USED) {
            const saved = JSON.parse(previous) as { expiresAt?: number } | null;
            if (!saved || typeof saved.expiresAt !== "number" || saved.expiresAt <= now())
              reserve();
          }
          return; // First package wins; expiry never makes a package eligible again.
        }
        const creative = installerCreative(value);
        if (creative)
          options.storage.setItem(
            KEY,
            JSON.stringify({ v: 1, creative, expiresAt: now() + LIFETIME }),
          );
      } catch {
        /* Optional measurement must never block startup. */
      }
    },
    consume(): Creative | null {
      try {
        const raw = options.storage.getItem(KEY);
        if (raw === null || raw === USED) return null;
        reserve(); // Reserve before returning; repeated registration cannot reuse a package label.
        const value = JSON.parse(raw) as Record<string, unknown>;
        if (
          !value ||
          value.v !== 1 ||
          Object.keys(value).sort().join() !== "creative,expiresAt,v" ||
          typeof value.expiresAt !== "number" ||
          !Number.isFinite(value.expiresAt) ||
          value.expiresAt <= now() ||
          value.expiresAt > now() + LIFETIME
        )
          return null;
        return installerCreative(value.creative);
      } catch {
        return null;
      }
    },
    clear() {
      try {
        options.storage.removeItem(KEY);
      } catch {
        /* No effect on core app use. */
      }
    },
  };
}

export const installerCampaign = createInstallerCampaign({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
});

export async function prepareInstallerCampaign() {
  if (!isTauri() || !env.isProduction || env.useMockApi || env.useMockPoseApi) return;
  try {
    const credentials = await installationStorage.get();
    installerCampaign.capture(env.installCreative, Boolean(credentials));
  } catch {
    /* Unknown credential state is never treated as a fresh installation. */
  }
}
