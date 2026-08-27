import { isTauri } from "@tauri-apps/api/core";
import type { UpdateService } from "./update.contract";
import { updateMock } from "./update.mock";
import { updateTauri } from "./update.tauri";

/** drag.service.ts와 동일한 스위치: 데스크톱에서만 실제 업데이터를 쓴다. */
export const updateService: UpdateService = isTauri() ? updateTauri : updateMock;
