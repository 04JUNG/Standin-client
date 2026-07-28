/**
 * localStorage가 없거나 차단된 환경(프라이빗 모드, 테스트 런너)에서도 조용히 동작하는
 * 저장소. zustand persist의 storage로 넘겨 쓴다.
 *
 * rememberedEmail.ts가 같은 이유로 try/catch를 두고 있다 — 저장 실패는 기능을 막을
 * 사유가 아니므로 메모리로 폴백하고 앱은 계속 돌아간다.
 */

const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // 프라이빗 모드는 접근 시점에 throw하므로 실제로 만져봐야 안다.
    const probe = "__standin_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export const safeStorage = {
  getItem(name: string): string | null {
    const store = backing();
    if (!store) return memory.get(name) ?? null;
    try {
      return store.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },

  setItem(name: string, value: string): void {
    const store = backing();
    if (!store) {
      memory.set(name, value);
      return;
    }
    try {
      store.setItem(name, value);
    } catch {
      // 용량 초과 등. 세션 동안만 유지한다.
      memory.set(name, value);
    }
  },

  removeItem(name: string): void {
    memory.delete(name);
    const store = backing();
    if (!store) return;
    try {
      store.removeItem(name);
    } catch {
      // 무시.
    }
  },
};
