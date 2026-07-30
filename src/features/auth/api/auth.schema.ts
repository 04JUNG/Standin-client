import { z } from "zod";

/**
 * 서버 응답 검증(CLAUDE.md §10). 서버가 계약을 어긴 응답을 보내면 화면 깊은 곳에서
 * `undefined`로 터지는 대신 경계에서 잡는다 — 실제로 refresh 응답에 `user`가 없는데
 * 클라가 그걸 읽고 있던 문제가 있었다.
 *
 * 모르는 필드는 통과시킨다(서버가 필드를 추가해도 클라가 깨지지 않아야 한다).
 */
export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().optional(),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});

export const authSessionSchema = authTokensSchema.extend({
  user: authUserSchema,
});
