import { create } from "zustand";
import type { LocalModel } from "./contract";
import { useInstallationStore } from "@/features/installation/installationStore";
// Device library stays local. Selection is scoped to installation/job/person, never a server character ID.
export const localSelectionKey = (job: string, person: number) =>
  JSON.stringify([useInstallationStore.getState().credentials?.installationId ?? "", job, person]);
export const useLocalBodies = create<{
  models: LocalModel[];
  selected: Record<string, string>;
  scroll: Record<string, number>;
  setModels: (models: LocalModel[]) => void;
  select: (key: string, id?: string) => void;
  setScroll: (key: string, value: number) => void;
}>((set) => ({
  models: [],
  selected: {},
  scroll: {},
  setModels: (models) =>
    set((state) => ({
      models,
      selected: Object.fromEntries(
        Object.entries(state.selected).filter(([, id]) =>
          models.some((m) => m.localModelId === id),
        ),
      ),
    })),
  select: (key, id) =>
    set((state) => {
      const selected = { ...state.selected };
      if (id) selected[key] = id;
      else delete selected[key];
      return { selected };
    }),
  setScroll: (key, value) => set((state) => ({ scroll: { ...state.scroll, [key]: value } })),
}));
export function selectedLocalModel(job: string, person: number) {
  const state = useLocalBodies.getState();
  return state.models.find(
    (m) => m.localModelId === state.selected[localSelectionKey(job, person)],
  );
}

/** Registration survives app/bar navigation; every entry can observe and cancel the same job. */
export const useLocalImport = create<{
  jobId?: string;
  stage: string;
  error: string;
}>(() => ({ stage: "", error: "" }));
