import { create } from "zustand";
import { parseJourneyUrl } from "./journeyClient";

// A short-lived link is kept only in memory until the visitor makes a choice.
export const useJourneyHandoff = create<{
  token: string | null;
  receive(url: string): void;
  clear(): void;
}>((set, get) => ({
  token: null,
  receive(url) {
    const token = parseJourneyUrl(url);
    if (token && !get().token) set({ token });
  },
  clear() {
    set({ token: null });
  },
}));
