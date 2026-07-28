import { useShortcutStore } from "@/shared/stores/shortcutStore";
import { useShortcuts } from "./useShortcuts";

/**
 * 앱 셸 전체에 걸리는 단축키. AppShell에서 1회 호출한다.
 *
 * 라우터가 flat 구조라 layout route가 없으므로, 모든 앱 화면이 거치는 AppShell이
 * 유일한 앱 전역 마운트 지점이다. 여기 두면 LoginPage와 CaptureOverlayPage에는
 * 구조적으로 걸리지 않는다(둘 다 AppShell을 쓰지 않는다) — 의도한 동작이다.
 *
 * shared에서 features를 import하지 않도록 store만 참조한다.
 */
export function useAppShortcuts(): void {
  const toggleCheatSheet = useShortcutStore((s) => s.toggleCheatSheet);

  useShortcuts({
    "app.toggleCheatSheet": () => toggleCheatSheet(),
  });
}
