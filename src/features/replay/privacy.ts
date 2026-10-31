/** Apply before persistence or upload; never store source URLs or local file paths. */
export function safeReplayText(value: string): string {
  return value
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(
      /(?<![A-Za-z0-9_-])(?:[A-Z]:[\\/]|\/(?:Users|home|private|tmp|var|Volumes)\/)[^\s<>"']+/gi,
      "[path]",
    )
    .replace(
      /\b(?:access_token|refresh_token|deviceToken|password|authorization|X-Device-Token)\s*[:=]\s*[^\s,;<>]+/gi,
      "[redacted]",
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[url]");
}
const forbiddenKeys =
  /^(?:password|token|deviceToken|accessToken|refreshToken|authorization|cookie|localPath|fullPath|__TAURI_INTERNALS__|path|folder|fileName|originalName)$/i;
export function sanitizeReplay(value: unknown): unknown {
  if (typeof value === "string") return safeReplayText(value);
  if (Array.isArray(value)) return value.map(sanitizeReplay);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbiddenKeys.test(key))
        .map(([key, item]) => [key, sanitizeReplay(item)]),
    );
  }
  return value;
}
