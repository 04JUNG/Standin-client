import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { capabilitySchema, modelSchema, progressSchema, type LocalProgress } from "./contract";
export const localBodyApi = {
  supported: () => isTauri(),
  capabilities: async () =>
    isTauri()
      ? capabilitySchema.parse(await invoke("personal_body_capabilities"))
      : { available: false, formats: [] as ("fbx" | "cs3c")[] },
  list: async () =>
    isTauri() ? z.array(modelSchema).parse(await invoke("personal_body_list")) : [],
  import: async (jobId: string, name: string, replaceId?: string) => {
    const result = await invoke("personal_body_import", {
      jobId,
      name,
      replaceId: replaceId ?? null,
    });
    return result === null ? null : modelSchema.parse(result);
  },
  preview: async (id: string, sourceHash: string) => {
    const data = await invoke<string>("personal_body_preview", { id, sourceHash });
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  },
  rename: async (id: string, name: string) => {
    await invoke("personal_body_rename", { id, name });
  },
  remove: async (id: string) => {
    await invoke("personal_body_delete", { id });
  },
  cancel: async (jobId: string) => {
    await invoke("personal_body_cancel", { jobId });
  },
  progress: (onProgress: (event: LocalProgress) => void) =>
    listen("personal-body-progress", (event) => {
      const parsed = progressSchema.safeParse(event.payload);
      if (parsed.success) onProgress(parsed.data);
    }),
};
