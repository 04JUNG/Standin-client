import { Channel, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadProgress, UpdateService } from "./update.contract";

/** Native code owns the update handle, durable cache, signature and installer. */
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export const updateTauri: UpdateService = {
  currentVersion: getVersion,
  isConfigured: () => command("updates_configured"),
  cached: () => command("updates_cached"),
  check: () => command("updates_check"),
  download(onProgress) {
    const channel = new Channel<DownloadProgress>();
    channel.onmessage = (progress) => onProgress?.(progress);
    return command("updates_download", { onProgress: channel });
  },
  install: () => command("updates_install"),
  relaunch,
};
