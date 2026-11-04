export const REPLAY_PROTOCOL = "session-replay.v1";
export const REPLAY_POLICY = "2026-10-28";
export function replayConfig(values: Record<string, unknown> = import.meta.env) {
  const enabled = (name: string) =>
    values[name] === undefined || values[name] === "true" || values[name] === "1";
  const environment = String(values.VITE_APP_ENV ?? (values.PROD ? "production" : "development"));
  const authorizationMode = values.VITE_REPLAY_CONSENT_MODE ?? "assumed";
  return {
    enabled: enabled("VITE_REPLAY_ENABLED"),
    captureEnabled: enabled("VITE_CAPTURE_REPLAY_ENABLED"),
    cspEnabled: enabled("VITE_CSP_RESULT_CAPTURE_ENABLED"),
    environment,
    authorizationMode,
    allowed:
      authorizationMode === "explicit" ||
      (authorizationMode === "assumed" && ["development", "staging"].includes(environment)),
  };
}
