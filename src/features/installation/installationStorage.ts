import { invoke, isTauri } from "@tauri-apps/api/core";

export interface InstallationCredentials {
  installationId: string;
  deviceToken: string;
  consentVersion: string;
}

const DEV_KEY = "standin.installation.credentials";

export const installationStorage = {
  async get(): Promise<InstallationCredentials | null> {
    const raw = isTauri()
      ? await invoke<string | null>("get_installation_credentials")
      : localStorage.getItem(DEV_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<InstallationCredentials>;
      return value.installationId && value.deviceToken && value.consentVersion
        ? (value as InstallationCredentials)
        : null;
    } catch {
      return null;
    }
  },
  async set(value: InstallationCredentials): Promise<void> {
    const raw = JSON.stringify(value);
    if (isTauri()) await invoke("set_installation_credentials", { value: raw });
    else localStorage.setItem(DEV_KEY, raw);
  },
  async clear(): Promise<void> {
    if (isTauri()) await invoke("clear_installation_credentials");
    else localStorage.removeItem(DEV_KEY);
  },
};
