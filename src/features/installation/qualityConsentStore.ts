import { create } from "zustand";
import { z } from "zod";
import { apiFetch } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import { env } from "@/shared/lib/env";
import { setAnalyticsConsent } from "@/features/analytics/analyticsClient";

export const QUALITY_CONSENT_VERSION = "2026-10-19";
export const qualityConsentSchema = z.object({
  version: z.literal(QUALITY_CONSENT_VERSION),
  personalData: z.boolean(),
  contentLicense: z.boolean(),
  consentId: z.string().nullable(),
  grantedAt: z.string().nullable(),
});
export type QualityConsent = z.infer<typeof qualityConsentSchema>;
export type QualityChoices = Pick<QualityConsent, "personalData" | "contentLicense">;
export const NO_QUALITY_CONSENT: QualityConsent = {
  version: QUALITY_CONSENT_VERSION,
  personalData: false,
  contentLicense: false,
  consentId: null,
  grantedAt: null,
};
let revision = 0;
function mock() {
  return env.useMockApi && !env.isProduction && import.meta.env.MODE !== "test";
}
interface State {
  consent: QualityConsent;
  loaded: boolean;
  saving: boolean;
  pendingChoices: QualityChoices | null;
  error: string | null;
  accept(value: unknown): void;
  reset(): void;
  refresh(): Promise<void>;
  save(choices: QualityChoices): Promise<boolean>;
}
export const useQualityConsentStore = create<State>((set, get) => ({
  consent: NO_QUALITY_CONSENT,
  loaded: false,
  saving: false,
  pendingChoices: null,
  error: null,
  accept(value) {
    const consent = qualityConsentSchema.parse(value);
    setAnalyticsConsent(consent.personalData && consent.contentLicense ? consent.consentId : null);
    set({ consent, loaded: true, pendingChoices: null, error: null });
  },
  reset() {
    revision++;
    setAnalyticsConsent(null);
    set({
      consent: NO_QUALITY_CONSENT,
      loaded: false,
      saving: false,
      pendingChoices: null,
      error: null,
    });
  },
  async refresh() {
    // A focus refresh must not erase a failed withdrawal or restart collection before retry.
    if (get().saving || get().pendingChoices) return;
    const current = ++revision;
    try {
      const value = mock()
        ? get().consent
        : await apiFetch<unknown>(endpoints.installations.qualityConsent, { auth: false });
      if (current === revision) get().accept(value);
    } catch {
      if (current !== revision) return;
      setAnalyticsConsent(null);
      set({
        loaded: false,
        error: "품질 검토 동의 상태를 확인하지 못했습니다. 기본 기능은 계속 이용할 수 있습니다.",
      });
    }
  },
  async save(choices) {
    if (get().saving) return false;
    const current = ++revision;
    // Stop collecting immediately, even when withdrawal needs a network retry.
    setAnalyticsConsent(null);
    set({ saving: true, pendingChoices: { ...choices }, error: null });
    try {
      const enabled = choices.personalData && choices.contentLicense;
      const value = mock()
        ? {
            ...choices,
            version: QUALITY_CONSENT_VERSION,
            consentId: enabled ? crypto.randomUUID() : null,
            grantedAt: enabled ? new Date().toISOString() : null,
          }
        : await apiFetch<unknown>(endpoints.installations.qualityConsent, {
            method: "PUT",
            auth: false,
            body: {
              personalData: choices.personalData,
              contentLicense: choices.contentLicense,
              version: QUALITY_CONSENT_VERSION,
            },
          });
      if (current !== revision) return false;
      get().accept(value);
      return true;
    } catch {
      if (current === revision)
        set({
          error:
            "변경이 서버에 반영되지 않았습니다. 다시 저장해 주세요. 철회는 서버 처리 완료 후 적용됩니다.",
        });
      return false;
    } finally {
      if (current === revision) set({ saving: false });
    }
  },
}));
