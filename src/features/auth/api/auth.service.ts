import { env } from "@/shared/lib/env";
import type { AuthService } from "./auth.contract";
import { authMock } from "./auth.mock";
import { authHttp } from "./auth.http";

/**
 * Mock/HTTP 선택 지점. UI는 어느 구현인지 알 필요가 없다(docs/02 §7).
 * 운영 build에서는 Mock을 비활성화한다.
 */
export const authService: AuthService =
  env.useMockApi && !env.isProduction ? authMock : authHttp;
