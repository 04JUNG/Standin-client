import { env } from "@/shared/lib/env";
import { ApiError, networkError, type AppError, type ServerErrorBody } from "./errors";

/**
 * 공통 HTTP client. base URL, 인증 헤더, 오류 정규화, access token 재발급만 담당한다(docs/02 §4).
 * access token은 메모리에만 둔다(docs/06 §6).
 */
let accessToken: string | null = null;
let installationCredentials: { installationId: string; deviceToken: string } | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setInstallationCredentials(
  credentials: { installationId: string; deviceToken: string } | null,
): void {
  installationCredentials = credentials;
}

/**
 * 401을 받았을 때 access token을 재발급할 방법. 새 토큰을 돌려주면 원 요청을 재시도하고,
 * `null`이면 세션이 끝난 것으로 본다.
 *
 * 이 client가 auth feature를 직접 import하면 shared → features 방향이 뒤집힌다. 그래서
 * 구현은 auth 쪽에 두고 앱 시작 시 여기에 꽂는다(`features/auth/lib/attachAuthRefresh.ts`).
 */
type RefreshHandler = () => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;

export function setUnauthorizedHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

/**
 * 진행 중인 재발급. 동시에 여러 요청이 401을 받아도 refresh는 정확히 한 번만 나간다
 * (ADR-002 single-flight). 서버의 refresh token은 **회전형(1회용)**이라 두 번 보내면
 * 하나는 반드시 실패하고, 그 실패가 멀쩡한 세션을 끊어버린다.
 */
let inflightRefresh: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  inflightRefresh ??= refreshHandler().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/** 테스트에서 모듈 상태를 초기화한다. */
export function __resetApiClient(): void {
  accessToken = null;
  installationCredentials = null;
  refreshHandler = null;
  inflightRefresh = null;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
  installation?: boolean;
  /**
   * 401을 받아도 재발급을 시도하지 않는다. 재발급 요청 자체가 401을 받았을 때
   * 무한히 되도는 것을 막는다.
   */
  skipRefresh?: boolean;
};

export type { ServerErrorBody };
export { ApiError };

async function parseError(res: Response): Promise<ApiError> {
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
  return new ApiError(res.status, code, message, requestId);
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const {
    method = "GET",
    body,
    signal,
    auth = true,
    installation = true,
    skipRefresh = false,
  } = options;

  async function send(): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const multipart = isFormData(body);
    if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
    if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    if (installation && installationCredentials) {
      headers["X-Installation-Id"] = installationCredentials.installationId;
      headers["X-Device-Token"] = installationCredentials.deviceToken;
    }

    try {
      const url =
        path.startsWith("http://") || path.startsWith("https://")
          ? path
          : `${env.apiBaseUrl}${path}`;
      return await fetch(url, {
        method,
        headers,
        body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch {
      // 네트워크 자체 실패는 정규화된 오류로 던진다.
      throw networkError() satisfies AppError;
    }
  }

  let res = await send();

  // access token 만료(기본 15분)로 401을 받으면 한 번 재발급하고 그대로 다시 보낸다.
  // 사용자는 작업 도중 갑자기 로그인 화면으로 튕기지 않아야 한다.
  if (res.status === 401 && auth && !skipRefresh) {
    const renewed = await refreshOnce();
    if (renewed) res = await send();
  }

  if (!res.ok) throw await parseError(res);

  return res;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiRequest(path, options);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 인증·토큰 재발급을 유지하면서 BVH 같은 텍스트 응답을 받는다. */
export async function apiFetchText(path: string, options: RequestOptions = {}): Promise<string> {
  const res = await apiRequest(path, options);
  return res.text();
}

/** 인증·토큰 재발급을 유지하면서 PNG 같은 바이너리 응답을 받는다. */
export async function apiFetchBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const res = await apiRequest(path, options);
  return res.blob();
}
