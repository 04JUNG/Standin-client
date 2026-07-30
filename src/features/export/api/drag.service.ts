import { isTauri } from "@tauri-apps/api/core";
import type { DragService } from "./drag.contract";
import { dragMock } from "./drag.mock";
import { dragTauri } from "./drag.tauri";

/** export.service.ts와 동일한 스위치: 데스크톱에서만 네이티브 드래그를 쓴다. */
export const dragService: DragService = isTauri() ? dragTauri : dragMock;
