import { isTauri } from "@tauri-apps/api/core";
import type { CaptureService } from "./capture.contract";
import { captureMock } from "./capture.mock";
import { captureTauri } from "./capture.tauri";

/**
 * Tauri 런타임에서는 실제 캡처, 브라우저에서는 Mock을 사용한다.
 * UI는 어느 구현인지 알 필요가 없다(docs/02 §7).
 */
export const captureService: CaptureService = isTauri() ? captureTauri : captureMock;
