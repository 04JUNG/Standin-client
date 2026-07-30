import { isTauri } from "@tauri-apps/api/core";
import type { AuthStorage } from "./authStorage.contract";
import { authStorageMemory } from "./authStorage.memory";
import { authStorageTauri } from "./authStorage.tauri";

export type { AuthStorage };

/**
 * Tauri에서는 OS 키체인, 브라우저(dev)에서는 인메모리(docs/02 §7의 구현 선택 패턴).
 * 호출부는 어느 구현인지 알 필요가 없다.
 */
export const authStorage: AuthStorage = isTauri() ? authStorageTauri : authStorageMemory;
