import { InteractiveController } from "./controller";
import { useInstallationStore } from "@/features/installation/installationStore";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
const controllers = new Map<
  string,
  { owner: string; jobId: string; personIndex: number; controller: InteractiveController }
>();
export function interactiveController(owner: string, jobId: string, personIndex: number) {
  ensureSubscriptions();
  const key = JSON.stringify([owner, jobId, personIndex]);
  if (!controllers.has(key)) {
    // Keep at most three jobs' private packets; disk/user selections live elsewhere.
    const jobs = [...new Set([...controllers.values()].map((entry) => entry.jobId))];
    if (!jobs.includes(jobId) && jobs.length >= 3) forgetInteractiveJob(jobs[0]);
    const controller = new InteractiveController({ jobId, personIndex });
    controller.subscribe(notifyInteractive);
    controllers.set(key, { owner, jobId, personIndex, controller });
  }
  return controllers.get(key)!.controller;
}
export function invalidateInteractiveJob(jobId: string, preserveLocalHands = false) {
  for (const entry of controllers.values())
    if (entry.jobId === jobId) {
      entry.controller.clearDraft();
      entry.controller.invalidate(preserveLocalHands);
    }
}
export function forgetInteractiveJob(jobId: string) {
  for (const [key, entry] of controllers)
    if (entry.jobId === jobId) {
      entry.controller.dispose();
      controllers.delete(key);
    }
}
let subscribed = false;
function ensureSubscriptions() {
  if (subscribed) return;
  subscribed = true;
  useInstallationStore.subscribe((next, prev) => {
    if (next.credentials?.installationId === prev.credentials?.installationId) return;
    for (const entry of controllers.values()) entry.controller.dispose();
    controllers.clear();
  });
  usePoseSelectionStore.subscribe((next, prev) => {
    if (next === prev) return;
    for (const entry of controllers.values()) {
      const s = entry.controller.snapshot();
      if (!s.binding) continue;
      const job = next.serverJobId ?? next.jobId;
      const candidate = next.selectedByPerson[entry.personIndex];
      const baseChanged =
        job !== entry.jobId ||
        (s.operation && candidate !== s.operation.candidateId) ||
        next.characterId !== prev.characterId ||
        next.characterByPerson[entry.personIndex] !== prev.characterByPerson[entry.personIndex] ||
        next.refineByPerson[entry.personIndex] !== prev.refineByPerson[entry.personIndex];
      const appearanceChanged =
        next.outlineByPerson[entry.personIndex] !== prev.outlineByPerson[entry.personIndex] ||
        next.skinByPerson[entry.personIndex] !== prev.skinByPerson[entry.personIndex] ||
        next.outlineEditingByPerson[entry.personIndex] !==
          prev.outlineEditingByPerson[entry.personIndex];
      if (baseChanged) entry.controller.invalidate();
      else if (appearanceChanged) entry.controller.invalidateAppearance();
    }
  });
}
let version = 0;
const listeners = new Set<() => void>();
export const subscribeInteractive = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const interactiveVersion = () => version;
export function notifyInteractive() {
  version++;
  for (const listener of listeners) listener();
}
