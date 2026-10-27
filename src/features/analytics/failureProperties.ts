import { ApiError } from "@/shared/api/errors";
import type { Feature } from "./featureJourney";
type Props = Record<string, string | number | boolean | null>;
/** Only structured status/code/type is examined. Never collect error messages or paths. */
export function failureProperties(error: unknown, feature: Feature): Props {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; kind?: unknown; name?: unknown })
      : {};
  const code =
    typeof value.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code)
      ? value.code
      : "UNKNOWN";
  let errorCategory = "unknown";
  if (error instanceof ApiError)
    errorCategory =
      error.status >= 500
        ? "server"
        : [401, 403].includes(error.status)
          ? "permission"
          : error.status >= 400
            ? "validation"
            : "unknown";
  else if (value.kind === "network" || code === "NETWORK_ERROR") errorCategory = "network";
  else if (
    value.kind === "auth" ||
    ["PERMISSION_DENIED", "CAPTURE_PERMISSION_DENIED", "EACCES", "EPERM"].includes(code)
  )
    errorCategory = "permission";
  else if (value.kind === "validation") errorCategory = "validation";
  else if (value.kind === "native" || error instanceof Error) errorCategory = "client";
  return {
    feature,
    errorCategory,
    code,
    ...(error instanceof ApiError && error.status >= 400 && error.status <= 599
      ? { httpStatus: error.status }
      : {}),
  };
}
