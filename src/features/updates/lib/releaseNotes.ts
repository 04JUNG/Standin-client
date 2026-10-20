import catalog from "../../../../releases/notes.json";
import { create } from "zustand";
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

export function markReleaseSeen(version: string) {
  const previous = safeStorage.getItem(SEEN_RELEASE_KEY);
  try {
    if (previous && compareVersions(previous, version) > 0) return;
  } catch {
    /* Replace corrupt metadata. */
  }
  safeStorage.setItem(SEEN_RELEASE_KEY, version);
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
