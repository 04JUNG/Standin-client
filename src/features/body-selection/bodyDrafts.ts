import { create } from "zustand";

export const bodyDraftKey = (owner: string, job: string, person: number) =>
  JSON.stringify([owner, job, person]);

/** The debounce interval is still an unsaved edit, before a query mutation exists. */
export const useBodyDrafts = create<{
  pending: Record<string, boolean>;
  setPending(key: string, value: boolean): void;
}>((set) => ({
  pending: {},
  setPending: (key, value) =>
    set((state) => {
      const pending = { ...state.pending };
      if (value) pending[key] = true;
      else delete pending[key];
      return { pending };
    }),
}));
