import { isTauri } from "@tauri-apps/api/core";
import { toTauriAccelerator } from "@/shared/lib/accelerator";
import { resolveAccelerator } from "@/shared/lib/shortcutRegistry";
import { useShortcutStore } from "@/shared/stores/shortcutStore";
import type { Accelerator } from "@/shared/types/shortcuts";
import { GlobalShortcutError } from "../api/globalShortcut.contract";
import { globalShortcutService } from "../api/globalShortcut.service";
import { startCaptureFlow } from "./startCaptureFlow";

/**
 * 전역 캡처 단축키 초기화(docs/07 §7).
 *
 * 등록 소유자를 이 파일 하나로 단일화한다. 설정에서 키를 바꾸면 store 구독이
 * 감지해 여기서만 재등록하므로, 재지정 UI에는 async 로직이 없다.
 */

let initialized = false;

/** 저장된 바인딩을 네이티브에 등록한다. 실패는 store에 남겨 설정 화면이 보여준다. */
async function applyGlobalBinding(accel: Accelerator | undefined): Promise<void> {
  const store = useShortcutStore.getState();

  if (!accel) {
    store.setGlobalStatus("failed", "등록할 단축키를 찾지 못했습니다.");
    return;
  }

  const native = toTauriAccelerator(accel);
  if (!native) {
    store.setGlobalStatus("failed", "이 키 조합은 전역 단축키로 등록할 수 없습니다.");
    return;
  }

  store.setGlobalStatus("registering");
  try {
    await globalShortcutService.register(native);
    useShortcutStore.getState().setGlobalStatus("registered");
  } catch (err) {
    const status =
      err instanceof GlobalShortcutError && err.code === "UNSUPPORTED" ? "unavailable" : "failed";
    const message =
      err instanceof GlobalShortcutError && err.code === "REGISTER_FAILED"
        ? "다른 프로그램이 이미 이 단축키를 사용하고 있습니다. 다른 키로 변경해 주세요."
        : err instanceof GlobalShortcutError
          ? err.message
          : "전역 단축키를 등록하지 못했습니다.";
    useShortcutStore.getState().setGlobalStatus(status, message);
  }
}

/** 설정에서 바뀐 값을 즉시 반영한다. 재지정 UI가 호출할 필요는 없다(구독이 처리). */
export async function syncCaptureShortcut(): Promise<void> {
  const { bindings } = useShortcutStore.getState();
  await applyGlobalBinding(resolveAccelerator("capture.start", bindings));
}

/** 앱 시작 시 1회 호출. Tauri가 아니면 등록을 건너뛴다. */
export async function initCaptureShortcut(): Promise<void> {
  // StrictMode의 effect 이중 실행에서 listen이 두 번 붙지 않게 한다.
  if (initialized) return;
  initialized = true;

  if (!isTauri()) {
    // 브라우저 개발 모드: 전역 등록 불가. 앱 내 대체 경로(home.startCapture)가 살아난다.
    useShortcutStore
      .getState()
      .setGlobalStatus("unavailable", "브라우저 개발 모드에서는 전역 단축키를 사용할 수 없습니다.");
    return;
  }

  const { listen } = await import("@tauri-apps/api/event");
  await listen("shortcut://capture", () => {
    void startCaptureFlow();
  });

  await syncCaptureShortcut();

  // capture.start가 바뀔 때만 재등록한다.
  let previous = resolveAccelerator("capture.start", useShortcutStore.getState().bindings);
  useShortcutStore.subscribe((state) => {
    const next = resolveAccelerator("capture.start", state.bindings);
    if (next === previous) return;
    previous = next;
    void applyGlobalBinding(next);
  });
}
