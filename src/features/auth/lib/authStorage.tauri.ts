import { invoke } from "@tauri-apps/api/core";
import type { AuthStorage } from "./authStorage.contract";

/**
 * OS 키체인 기반 저장소(ADR-002). Rust `secure_store` command를 감싼다.
 *
 * 키체인 접근은 실패할 수 있지만(정책·잠긴 키체인) 그 때문에 앱이 멈추면 안 된다.
 * 읽기 실패는 "저장된 세션 없음"으로, 쓰기·삭제 실패는 조용히 넘긴다 —
 * 최악의 경우 이번 실행에서 세션이 유지되지 않을 뿐 로그인 자체는 가능하다.
 * ⚠ 실패 로그에 토큰을 남기지 않는다(docs/11 §5).
 */
export const authStorageTauri: AuthStorage = {
  async getRefreshToken() {
    try {
      return await invoke<string | null>("get_secure_token");
    } catch (err) {
      console.warn("[auth] 보안 저장소 읽기 실패", err);
      return null;
    }
  },

  async setRefreshToken(token: string) {
    try {
      await invoke("set_secure_token", { token });
    } catch (err) {
      console.warn("[auth] 보안 저장소 저장 실패", err);
    }
  },

  async clear() {
    try {
      await invoke("clear_secure_token");
    } catch (err) {
      console.warn("[auth] 보안 저장소 삭제 실패", err);
    }
  },
};
