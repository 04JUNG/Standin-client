import { create } from "zustand";

/** Track work that can outlive its page and is not owned by React Query. */
export const useWorkActivityStore = create<{ count: number }>(() => ({ count: 0 }));

export function beginWork(): () => void {
  useWorkActivityStore.setState((s) => ({ count: s.count + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useWorkActivityStore.setState((s) => ({ count: Math.max(0, s.count - 1) }));
  };
}
