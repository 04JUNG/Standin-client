import { useCallback, useSyncExternalStore, type SetStateAction } from "react";
import type { PreviewAppearance } from "./renderer";

const defaults: PreviewAppearance = { skin: "default", outlineWidth: 0 };
const appearances = new Map<string, PreviewAppearance>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Session-only visual settings shared by persistent and enlarged views. */
export function usePreviewAppearance(key: string) {
  const snapshot = useCallback(() => appearances.get(key) ?? defaults, [key]);
  const appearance = useSyncExternalStore(subscribe, snapshot, () => defaults);
  const setAppearance = useCallback(
    (update: SetStateAction<PreviewAppearance>) => {
      const current = appearances.get(key) ?? defaults;
      const next = typeof update === "function" ? update(current) : update;
      if (next.skin === current.skin && next.outlineWidth === current.outlineWidth) return;
      appearances.delete(key);
      appearances.set(key, next);
      while (appearances.size > 64) appearances.delete(appearances.keys().next().value!);
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [appearance, setAppearance] as const;
}
