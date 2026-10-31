type Listener = (tag: string, payload: Record<string, unknown>, jobId?: string) => void;
const listeners = new Set<Listener>();
/** Synchronous, fail-open observation. Never changes product event delivery. */
export function observeReplay(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function replayObservation(tag: string, payload: Record<string, unknown>, jobId?: string) {
  for (const listener of listeners) {
    try {
      listener(tag, payload, jobId);
    } catch {
      /* replay cannot block product work */
    }
  }
}
