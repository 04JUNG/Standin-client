import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/features/auth/api/auth.service", () => ({ authService: {} }));
vi.mock("@/features/auth/lib/authStorage", () => ({
  authStorage: {
    getRefreshToken: vi.fn(async () => null),
    setRefreshToken: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  },
}));
vi.mock("@/shared/api/client", () => ({ setAccessToken: vi.fn() }));

const { clearQueryCacheOnSessionEnd } = await import("./sessionCacheReset");
const { useAuthStore } = await import("@/features/auth/store/authStore");

let queryClient: QueryClient;
let unsubscribe: () => void;

beforeEach(() => {
  queryClient = new QueryClient();
  unsubscribe = clearQueryCacheOnSessionEnd(queryClient);
  useAuthStore.setState({ status: "authenticated", user: { id: "u1", email: "a@b.com" } });
});

afterEach(() => {
  unsubscribe();
});

/** 이전 사용자의 서버 데이터가 캐시에 들어 있는 상태를 만든다. */
function seedCache() {
  queryClient.setQueryData(["auth", "me"], { id: "u1", email: "a@b.com" });
  queryClient.setQueryData(["analysis", "jobs"], [{ id: "job_1" }]);
}

describe("clearQueryCacheOnSessionEnd", () => {
  it("로그아웃하면 이전 사용자의 캐시가 남지 않는다", () => {
    // docs/06 §9 — "Query cache에 이전 사용자 데이터가 남지 않음".
    seedCache();

    useAuthStore.setState({ status: "unauthenticated", user: null });

    expect(queryClient.getQueryData(["auth", "me"])).toBeUndefined();
    expect(queryClient.getQueryData(["analysis", "jobs"])).toBeUndefined();
  });

  it("토큰 만료로 세션이 끊겨도 캐시를 비운다", () => {
    seedCache();

    useAuthStore.getState().endSession("세션이 만료되었습니다. 다시 로그인해 주세요.");

    expect(queryClient.getQueryData(["analysis", "jobs"])).toBeUndefined();
  });

  it("로그인 상태에서의 다른 변화로는 캐시를 비우지 않는다", () => {
    seedCache();

    useAuthStore.setState({ user: { id: "u1", email: "a@b.com", displayName: "작가" } });

    expect(queryClient.getQueryData(["analysis", "jobs"])).toEqual([{ id: "job_1" }]);
  });

  it("구독을 해제하면 더 이상 비우지 않는다", () => {
    seedCache();
    unsubscribe();

    useAuthStore.setState({ status: "unauthenticated", user: null });

    expect(queryClient.getQueryData(["analysis", "jobs"])).toEqual([{ id: "job_1" }]);
  });
});
