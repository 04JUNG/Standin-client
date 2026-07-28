import { isTauri } from "@tauri-apps/api/core";
import type { WindowModeService } from "./windowMode.contract";
import { windowModeMock } from "./windowMode.mock";
import { windowModeTauri } from "./windowMode.tauri";

/** Tauri에서는 실제 창 조작, 브라우저에서는 no-op(docs/02 §7). */
export const windowModeService: WindowModeService = isTauri()
  ? windowModeTauri
  : windowModeMock;
