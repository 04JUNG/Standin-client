import { env } from "@/shared/lib/env";
import { networkError, type AppError } from "./errors";

/**
 * 공통 HTTP client. base URL, 인증 헤더, 오류 정규화만 담당한다(docs/02 §4).
 * access token은 메모리에만 둔다(docs/06 §6). refresh 동시성은 ADR-002의 후속 작업.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
};

export type ServerErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    // 네트워크 자체 실패는 정규화된 오류로 던진다.
    throw networkError() satisfies AppError;
  }

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = res.statusText;
    let requestId: string | undefined;
    try {
      const data = (await res.json()) as Partial<ServerErrorBody>;
      if (data.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
        requestId = data.error.requestId;
      }
    } catch {
      // 응답 본문이 JSON이 아니면 statusText를 유지한다.
    }
    throw new ApiError(res.status, code, message, requestId);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
