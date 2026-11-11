import { create } from "zustand";

export type AccessPhase = "unknown" | "allowed" | "blocked" | "unavailable";
export const useAccessStore = create<{
  phase: AccessPhase;
  setPhase(phase: AccessPhase): void;
}>((set) => ({ phase: "unknown", setPhase: (phase) => set({ phase }) }));
