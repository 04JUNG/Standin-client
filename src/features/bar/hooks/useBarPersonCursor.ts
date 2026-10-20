import { useCallback, type SetStateAction } from "react";
import { create } from "zustand";
import { useInstallationStore } from "@/features/installation/installationStore";

// Keep only the current bar's person cursor across review/back/collapse. A different
// installation or job cannot inherit the previous person's position.
const useCursor = create<{
  key: string;
  cursor: number;
  set: (key: string, cursor: SetStateAction<number>) => void;
}>((set) => ({
  key: "",
  cursor: 0,
  set: (key, cursor) =>
    set((s) => ({
      key,
      cursor: typeof cursor === "function" ? cursor(s.key === key ? s.cursor : 0) : cursor,
    })),
}));

export function useBarPersonCursor(
  jobId: string | null,
): [number, (cursor: SetStateAction<number>) => void] {
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const key = JSON.stringify([owner, jobId]);
  const cursor = useCursor((s) => (s.key === key ? s.cursor : 0));
  const set = useCursor((s) => s.set);
  const setCursor = useCallback((value: SetStateAction<number>) => set(key, value), [key, set]);
  return [cursor, setCursor];
}
