import { create } from "zustand";
import { env } from "@/shared/lib/env";
import { campaignCounter } from "./campaignCounts";
export type Creative = "meta-poster-a" | "meta-hook-a";
export function parseAcquisitionUrl(value: string, environment = env.appEnv): Creative | null {
  try {
    const url = new URL(value);
    const protocol =
      environment === "production"
        ? "standin:"
        : environment === "staging"
          ? "standin-staging:"
          : "standin-dev:";
    if (
      url.protocol !== protocol ||
      url.host !== "campaign" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
    if (
      url.searchParams.get("source") !== "instagram" ||
      url.searchParams.get("campaign") !== "open-beta"
    )
      return null;
    if (
      [...url.searchParams.keys()].some((k) => !["source", "campaign", "creative"].includes(k)) ||
      [...url.searchParams].length !== 3
    )
      return null;
    const creative = url.searchParams.get("creative");
    return creative === "meta-poster-a" || creative === "meta-hook-a" ? creative : null;
  } catch {
    return null;
  }
}
// Kept in memory only until an explicit choice. No SDK, clipboard read or fingerprinting.
export const useAcquisitionStore = create<{
  pending: Creative | null;
  receive(url: string): void;
  clear(): void;
}>((set, get) => ({
  pending: null,
  receive(url) {
    const creative = parseAcquisitionUrl(url);
    if (creative) campaignCounter.receive(creative);
    if (creative && !get().pending) set({ pending: creative });
  },
  clear() {
    set({ pending: null });
  },
}));
