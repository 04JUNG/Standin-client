import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiClient,
  apiFetch,
  ApiError,
  setAccessToken,
  setUnauthorizedHandler,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: "server text", requestId: "req_1" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 요청에 실린 Authorization 헤더를 꺼낸다. */
function authHeaderOf(call: unknown[]): string | null {
  const init = call[1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  return headers["Authorization"] ?? null;
}

describe("apiFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetApiClient();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiClient();
  });

  it("access token을 Bearer 헤더로 싣고, auth:false면 싣지 않는다", async () => {
    setAccessToken("tok-1");
    // Response의 본문은 한 번만 읽을 수 있으므로 호출마다 새로 만든다.
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    await apiFetch("/v1/users/me");
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe("Bearer tok-1");

    await apiFetch("/v1/auth/login", { method: "POST", body: {}, auth: false });
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBeNull();
  });

  it("401을 받으면 토큰을 재발급하고 원 요청을 새 토큰으로 재시도한다", async () => {
    setAccessToken("expired");
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "INVALID_TOKEN"))
      .mockResolvedValueOnce(jsonResponse({ id: "user_1" }));

    setUnauthorizedHandler(async () => {
      setAccessToken("fresh");
      return "fresh";
    });

    await expect(apiFetch<{ id: string }>("/v1/users/me")).resolves.toEqual({ id: "user_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe("Bearer expired");
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe("Bearer fresh");
  });

  it("동시에 여러 요청이 401을 받아도 재발급은 한 번만 한다(single-flight)", async () => {
    // 서버의 refresh token은 1회용이라 두 번 보내면 하나는 반드시 실패한다.
    setAccessToken("expired");
    fetchMock.mockImplementation(async () => {
      return authHeaderOf(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]) ===
        "Bearer expired"
        ? errorResponse(401, "INVALID_TOKEN")
        : jsonResponse({ ok: true });
    });

    let refreshCalls = 0;
    setUnauthorizedHandler(async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      setAccessToken("fresh");
      return "fresh";
    });

    const results = await Promise.all([
      apiFetch("/v1/a"),
      apiFetch("/v1/b"),
      apiFetch("/v1/c"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  });

  it("재발급이 실패하면 원래의 401을 그대로 올린다", async () => {
    setAccessToken("expired");
    fetchMock.mockResolvedValue(errorResponse(401, "INVALID_TOKEN"));
    setUnauthorizedHandler(async () => null);

    await expect(apiFetch("/v1/users/me")).rejects.toBeInstanceOf(ApiError);
    // 재발급이 실패했으므로 재시도하지 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skipRefresh 요청은 401을 받아도 재발급을 시도하지 않는다", async () => {
    // 재발급 요청 자체가 401을 받았을 때 무한히 도는 것을 막는 장치다.
    fetchMock.mockResolvedValue(errorResponse(401, "INVALID_TOKEN"));
    const handler = vi.fn(async () => "fresh");
    setUnauthorizedHandler(handler);

    await expect(apiFetch("/v1/auth/refresh", { method: "POST", skipRefresh: true })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("네트워크 실패는 재시도 가능한 network 오류로 정규화한다", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/v1/users/me")).rejects.toMatchObject({
      kind: "network",
      retryable: true,
    });
  });

  it("204는 본문 파싱 없이 통과한다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
