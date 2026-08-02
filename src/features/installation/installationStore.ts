import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { apiFetch, setInstallationCredentials } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { installationStorage, type InstallationCredentials } from "./installationStorage";
import { resetAnalyticsQueue } from "@/features/analytics/analyticsClient";

export const CONSENT_VERSION = "2026-08-02";

type InstallationStatus = "initializing" | "consent_required" | "registered" | "error";

interface InstallationState {
  status: InstallationStatus;
  credentials: InstallationCredentials | null;
  error: string | null;
  initialize(): Promise<void>;
  register(): Promise<void>;
  withdraw(): Promise<void>;
}

function osName(): string {
  const value = navigator.platform.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("linux")) return "linux";
  return "unknown";
}

interface InstallationEnvironment {
  appVersion: string;
  osName: string;
  osVersion: string;
  architecture: string;
}

async function getInstallationEnvironment(): Promise<InstallationEnvironment> {
  if (isTauri()) {
    return invoke<InstallationEnvironment>("get_installation_environment");
  }
  return {
    appVersion: import.meta.env.VITE_APP_VERSION || "0.1.0",
    osName: osName(),
    osVersion: "unknown",
    architecture: "unknown",
  };
}

export const useInstallationStore = create<InstallationState>((set, get) => ({
  status: "initializing",
  credentials: null,
  error: null,
  async initialize() {
    try {
      const credentials = await installationStorage.get();
      if (!credentials || credentials.consentVersion !== CONSENT_VERSION) {
        resetAnalyticsQueue();
        setInstallationCredentials(null);
        set({ status: "consent_required", credentials: null, error: null });
        return;
      }
      setInstallationCredentials(credentials);
      set({ status: "registered", credentials, error: null });
    } catch {
      set({ status: "error", error: "설치 인증정보를 불러오지 못했습니다." });
    }
  },
  async register() {
    set({ status: "initializing", error: null });
    try {
      resetAnalyticsQueue();
      const environment = await getInstallationEnvironment();
      const response = await apiFetch<InstallationCredentials>(endpoints.installations.register, {
        method: "POST",
        auth: false,
        installation: false,
        body: {
          consentVersion: CONSENT_VERSION,
          consentedAt: new Date().toISOString(),
          ...environment,
          locale: navigator.language || "unknown",
        },
      });
      const credentials = { ...response, consentVersion: CONSENT_VERSION };
      await installationStorage.set(credentials);
      setInstallationCredentials(credentials);
      set({ status: "registered", credentials, error: null });
    } catch {
      set({ status: "consent_required", error: "설치 등록에 실패했습니다. 다시 시도해 주세요." });
    }
  },
  async withdraw() {
    if (get().status === "registered") {
      await apiFetch(endpoints.installations.currentData, { method: "DELETE", auth: false });
    }
    await installationStorage.clear();
    resetAnalyticsQueue();
    setInstallationCredentials(null);
    set({ status: "consent_required", credentials: null, error: null });
  },
}));
