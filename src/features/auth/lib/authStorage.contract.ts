/**
 * refresh token 저장 추상화(docs/02 §6, ADR-002).
 *
 * access token은 절대 여기 오지 않는다 — 메모리(shared/api/client.ts)에만 둔다(docs/06 §6).
 */
export interface AuthStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}
