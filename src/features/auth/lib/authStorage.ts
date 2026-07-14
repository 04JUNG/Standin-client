/**
 * refresh token 저장 추상화(docs/02 §6, ADR-002).
 *
 * 현재는 브라우저/Vite 개발에서 동작하는 인메모리 구현이다.
 * 실제 구현은 Rust secure storage command(get/set/clear_secure_token)로 교체한다.
 * localStorage 평문 장기 저장은 금지(docs/06 §6).
 */
export interface AuthStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

let memoryToken: string | null = null;

const memoryStorage: AuthStorage = {
  async getRefreshToken() {
    return memoryToken;
  },
  async setRefreshToken(token: string) {
    memoryToken = token;
  },
  async clear() {
    memoryToken = null;
  },
};

// TODO(ADR-002): Tauri secure storage command 구현으로 교체.
export const authStorage: AuthStorage = memoryStorage;
