import { invoke, isTauri } from "@tauri-apps/api/core";
export type AppSession = { appSessionId: string; startedAt: number };
let session: AppSession = { appSessionId: crypto.randomUUID(), startedAt: Date.now() };
let epochAnchor = Date.now();
let monotonicAnchor = performance.now();
export const sessionClock = () => ({
  epochMs: Math.round(epochAnchor + performance.now() - monotonicAnchor),
  monotonicOffsetMs: Math.max(
    0,
    Math.round(epochAnchor - session.startedAt + performance.now() - monotonicAnchor),
  ),
});
let ready: Promise<AppSession> | undefined;
export const appSession = () => session;
export function initializeAppSession(): Promise<AppSession> {
  return (ready ??= (
    isTauri() ? invoke<AppSession>("replay_session") : Promise.resolve(session)
  ).then((value) => {
    epochAnchor = Date.now();
    monotonicAnchor = performance.now();
    return (session = value);
  }));
}
