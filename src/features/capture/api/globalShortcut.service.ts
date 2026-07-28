import { isTauri } from "@tauri-apps/api/core";
import type { GlobalShortcutService } from "./globalShortcut.contract";
import { globalShortcutMock } from "./globalShortcut.mock";
import { globalShortcutTauri } from "./globalShortcut.tauri";

/**
 * Tauri 런타임에서는 실제 등록, 브라우저에서는 Mock을 사용한다.
 * UI는 어느 구현인지 알 필요가 없다(docs/02 §7).
 */
export const globalShortcutService: GlobalShortcutService = isTauri()
  ? globalShortcutTauri
  : globalShortcutMock;
