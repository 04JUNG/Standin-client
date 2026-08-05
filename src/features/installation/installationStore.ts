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

export interface InstallationEnvironment {
  appVersion: string;
  osName: string;
  osVersion: string;
  architecture: string;
}

/** Tauri 밖(브라우저 dev·테스트)에서 쓸 수 있는 만큼만 채운 값. */
function browserEnvironment(): InstallationEnvironment {
  return {
    appVersion: import.meta.env.VITE_APP_VERSION,
    osName: osName(),
    osVersion: "unknown",
    architecture: "unknown",
  };
}

/**
 * 설치 등록과 `app_started`가 같은 값을 쓰도록 한 곳에서 만든다.
 * 두 곳에서 따로 채우면 같은 property가 서로 다른 어휘로 쌓인다.
 */
export async function getInstallationEnvironment(): Promise<InstallationEnvironment> {
  if (!isTauri()) return browserEnvironment();
  try {
    return await invoke<InstallationEnvironment>("get_installation_environment");
  } catch {
    return browserEnvironment();
  }
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
    set({ error: null });
    if (get().status === "registered") {
      try {
        await apiFetch(endpoints.installations.currentData, { method: "DELETE", auth: false });
      } catch {
        // 로컬 자격증명을 먼저 지우면 서버 데이터는 남은 채 삭제를 다시 요청할 방법이
        // 사라진다. 상태를 그대로 두고 사용자가 재시도할 수 있게 한다.
        set({ error: "데이터 삭제를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요." });
        return;
      }
    }
    try {
      await installationStorage.clear();
    } catch {
      // 서버 삭제는 끝났다. 보안 저장소만 남은 상태로 두면 다음 실행에서 폐기된
      // 자격증명으로 요청하게 되므로, 메모리·큐라도 반드시 비운다.
      set({ error: "보안 저장소를 정리하지 못했습니다. 앱을 다시 시작해 주세요." });
    }
    resetAnalyticsQueue();
    setInstallationCredentials(null);
    set({ status: "consent_required", credentials: null });
  },
}));
