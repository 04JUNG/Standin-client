import type { AuthStorage } from "./authStorage.contract";

/**
 * 브라우저(Vite dev)용 인메모리 저장소.
 *
 * localStorage에 refresh token을 평문으로 두는 것은 금지이고(docs/06 §6), 브라우저에는
 * OS 키체인이 없다. 그래서 dev에서는 새로고침하면 로그아웃되는 쪽을 택한다 —
 * 세션 유지는 Tauri 런타임에서만 보장된다.
 */
let memoryToken: string | null = null;

export const authStorageMemory: AuthStorage = {
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
