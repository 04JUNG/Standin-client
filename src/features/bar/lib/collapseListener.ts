import { isTauri } from "@tauri-apps/api/core";
import { collapseToBar } from "./openBar";

/**
 * 창 최소화를 가로채 플로팅 바로 접는다(ADR-008).
 *
 * Rust가 최소화를 감지해 즉시 unminimize한 뒤 이 이벤트를 보낸다. 작업 표시줄로
 * 숨는 대신 화면 위 작은 버튼으로 남게 하려는 것이다.
 */

let initialized = false;

export async function initCollapseToBar(): Promise<void> {
  // StrictMode의 effect 이중 실행에서 listen이 두 번 붙지 않게 한다.
  if (initialized) return;
  initialized = true;

  if (!isTauri()) return;

  const { listen } = await import("@tauri-apps/api/event");
  await listen("window://collapse-to-bar", () => {
    void collapseToBar();
  });
}
