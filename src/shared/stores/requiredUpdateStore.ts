import { create } from "zustand";
import { MINIMUM_CLIENT_VERSION } from "@/shared/lib/clientVersion";

// Session-only latch: navigating or dismissing an optional banner cannot unblock the app.
export const useRequiredUpdateStore = create<{
  minimumVersion: string | null;
  requireUpdate(minimumVersion?: string): void;
}>((set) => ({
  minimumVersion: null,
  requireUpdate: (minimumVersion = MINIMUM_CLIENT_VERSION) => set({ minimumVersion }),
}));
