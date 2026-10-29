import { create } from "zustand";

const key = "standin.acquisition-choice.v1";
const ttl = 90 * 24 * 60 * 60 * 1000;
type Choice = { installationId: string; allowed: boolean; chosenAt: number; version: "2026-10-29" };
function read(): Choice | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const valid =
      value &&
      typeof value.installationId === "string" &&
      typeof value.allowed === "boolean" &&
      value.version === "2026-10-29" &&
      Number.isFinite(value.chosenAt) &&
      value.chosenAt <= Date.now() &&
      Date.now() - value.chosenAt < ttl;
    if (!valid) localStorage.removeItem(key);
    return valid ? value : null;
  } catch {
    return null;
  }
}
export const useAcquisitionChoiceStore = create<{
  choice: Choice | null;
  error: string;
  record(installationId: string, allowed: boolean): void;
  mode(installationId: string | undefined): "allow" | "deny" | "unset";
  reset(): void;
}>((set, get) => ({
  choice: read(),
  error: "",
  record(installationId, allowed) {
    const choice: Choice = { installationId, allowed, chosenAt: Date.now(), version: "2026-10-29" };
    try {
      localStorage.setItem(key, JSON.stringify(choice));
    } catch {
      /* Session-only choice. */
    }
    set({ choice, error: "" });
  },
  mode(installationId) {
    const choice = get().choice;
    if (
      !installationId ||
      choice?.installationId !== installationId ||
      Date.now() < choice.chosenAt ||
      Date.now() - choice.chosenAt >= ttl
    )
      return "unset";
    return choice.allowed ? "allow" : "deny";
  },
  reset() {
    try {
      localStorage.removeItem(key);
    } catch {
      /* No persisted choice available. */
    }
    set({ choice: null, error: "" });
  },
}));
