import catalog from "../../../../releases/notes.json";
import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { safeStorage } from "@/shared/lib/safeStorage";
import {
  compareVersions,
  releasesBetween,
  validateCatalog,
} from "../../../../releases/catalog.mjs";

export const releases = validateCatalog(catalog);
export { releasesBetween };
export const SEEN_RELEASE_KEY = "standin.updates.lastSeenRelease";

export const useReleaseNotesStore = create<{
  historyRequested: boolean;
  requestHistory(): void;
  closeHistory(): void;
}>((set) => ({
  historyRequested: false,
  requestHistory: () => set({ historyRequested: true }),
  closeHistory: () => set({ historyRequested: false }),
}));

export async function readSeenRelease(): Promise<string | null> {
  const native = isTauri() ? await invoke<string | null>("release_notes_seen") : null;
  return native ?? safeStorage.getItem(SEEN_RELEASE_KEY);
}

export async function markReleaseSeen(version: string): Promise<string> {
  if (isTauri()) {
    // IPC completes only after the native file has been synced and atomically renamed.
    const saved = await invoke<string>("release_notes_acknowledge");
    safeStorage.setItem(SEEN_RELEASE_KEY, saved);
    return saved;
  }
  const previous = safeStorage.getItem(SEEN_RELEASE_KEY);
  try {
    if (previous && compareVersions(previous, version) > 0) return previous;
  } catch {
    /* Replace corrupt metadata. */
  }
  safeStorage.setItem(SEEN_RELEASE_KEY, version);
  return version;
}

export function releaseHistory(current: string) {
  try {
    return releases
      .filter((r) => compareVersions(r.version, current) <= 0)
      .slice()
      .reverse();
  } catch {
    return [];
  }
}
