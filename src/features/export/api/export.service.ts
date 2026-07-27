import { isTauri } from "@tauri-apps/api/core";
import type { ExportService } from "./export.contract";
import { exportMock } from "./export.mock";
import { exportTauri } from "./export.tauri";

/**
 * capture.service.ts와 동일한 스위치: Tauri 런타임에서는 실제 파일 저장, 브라우저에서는 Mock.
 */
export const exportService: ExportService = isTauri() ? exportTauri : exportMock;
