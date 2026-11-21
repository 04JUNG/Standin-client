import { z } from "zod";
import { ApiError, isAppError } from "@/shared/api/errors";

export function isInstallationAuthenticationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 &&
    ["INSTALLATION_REQUIRED", "INVALID_INSTALLATION"].includes(error.code);
}

export function accessCheckMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "이 기기의 인증정보를 확인하지 못했어요. 다시 확인하거나 앱을 다시 시작해 주세요.";
    if (error.status === 403 && error.code === "CONSENT_REQUIRED")
      return "이용 약관 확인이 필요해요. 앱을 다시 시작해 주세요.";
    if (error.status >= 500)
      return "서버에서 이용 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
    if (error.status === 429)
      return "확인 요청이 많아요. 잠시 후 다시 시도해 주세요.";
  }
  if (isAppError(error) && error.kind === "network")
    return "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  if (error instanceof z.ZodError)
    return "이용 정보 응답을 확인하지 못했어요. 앱 업데이트를 확인해 주세요.";
  return "이용 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/** Never include server messages, bodies or device credentials in diagnostics. */
export function accessCheckDiagnostic(error: unknown) {
  if (error instanceof ApiError)
    return { kind: "http", status: error.status, code: error.code, requestId: error.requestId };
  return { kind: error instanceof z.ZodError ? "response" :
    isAppError(error) ? error.kind : "unexpected" };
}
