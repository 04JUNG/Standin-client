import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { apiFetch } from "@/shared/api/client";
import { installationStorage } from "./installationStorage";
import { useInstallationStore, CONSENT_VERSION } from "./installationStore";
import { useQualityConsentStore, NO_QUALITY_CONSENT } from "./qualityConsentStore";
import { BetaConsentPage } from "./BetaConsentPage";
import { QualityConsentSection } from "./QualityConsentSection";
import { useAcquisitionChoiceStore } from "./acquisitionChoiceStore";
import { campaignCounter } from "./campaignCounts";
import { installerCampaign } from "./installerCampaign";
import { useAcquisitionStore } from "./acquisitionStore";

vi.mock("./campaignCounts", () => ({
  campaignCounter: {
    initializeNewRegistration: vi.fn(),
    purgeExpired: vi.fn(),
    clear: vi.fn(),
    receive: vi.fn(),
  },
}));

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn(), setInstallationCredentials: vi.fn() }));
vi.mock("./installationStorage", () => ({
  installationStorage: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock("@/features/capture/api/capture.service", () => ({
  captureService: { screenPermissionStatus: vi.fn().mockResolvedValue("granted") },
}));
const credentials = {
  installationId: "inst_test",
  deviceToken: "token",
  consentVersion: CONSENT_VERSION,
};
const granted = {
  ...NO_QUALITY_CONSENT,
  personalData: true,
  contentLicense: true,
  consentId: "grant-a",
  grantedAt: "2026-10-19T00:00:00Z",
};
const fetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  installerCampaign.clear();
  useAcquisitionChoiceStore.getState().reset();
  useAcquisitionStore.setState({ pending: "meta-poster-a" });
  useQualityConsentStore.getState().reset();
  useInstallationStore.setState({ status: "consent_required", credentials: null, error: null });
});

describe("optional quality consent", () => {
  it("counts a plain installer launch without granting installation linkage", async () => {
    useAcquisitionStore.setState({ pending: null });
    installerCampaign.capture("meta-hook-a", false);
    fetchMock.mockResolvedValue({ ...credentials, qualityConsent: NO_QUALITY_CONSENT });
    await useInstallationStore
      .getState()
      .register({ personalData: false, contentLicense: false }, false);
    expect(campaignCounter.initializeNewRegistration).toHaveBeenCalledWith("meta-hook-a");
    expect(useAcquisitionChoiceStore.getState().mode(credentials.installationId)).toBe("deny");
    expect(useAcquisitionStore.getState().pending).toBeNull();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("meta-hook-a");
  });
  it("uses the package source for opted-in linkage and preserves it after failed registration", async () => {
    installerCampaign.capture("meta-hook-a", false);
    fetchMock.mockRejectedValueOnce(Error("offline"));
    await useInstallationStore.getState().register(undefined, true);
    expect(campaignCounter.initializeNewRegistration).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ...credentials, qualityConsent: NO_QUALITY_CONSENT });
    await useInstallationStore.getState().register(undefined, true);
    expect(campaignCounter.initializeNewRegistration).toHaveBeenCalledWith("meta-hook-a");
    expect(useAcquisitionChoiceStore.getState().mode(credentials.installationId)).toBe("allow");
    expect(useAcquisitionStore.getState().pending).toBe("meta-hook-a");
  });
  it("all checkboxes start unchecked and basic agreement alone permits registration", async () => {
    fetchMock.mockResolvedValue({ ...credentials, qualityConsent: NO_QUALITY_CONSENT });
    render(
      <MemoryRouter>
        <BetaConsentPage />
      </MemoryRouter>,
    );
    const checks = screen.getAllByRole("checkbox");
    checks.forEach((check) => expect(check).not.toBeChecked());
    expect(screen.getByRole("button", { name: "선택한 항목만 동의하고 시작" })).toBeDisabled();
    await userEvent.click(checks[0]);
    expect(screen.getByRole("button", { name: "선택한 항목만 동의하고 시작" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "선택한 항목만 동의하고 시작" }));
    await waitFor(() => expect(useInstallationStore.getState().status).toBe("registered"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/installations",
      expect.objectContaining({
        body: expect.objectContaining({
          qualityConsent: {
            version: "2026-10-19",
            personalData: false,
            contentLicense: false,
          },
        }),
      }),
    );
    expect(installationStorage.set).toHaveBeenCalledWith(credentials);
    expect(useAcquisitionChoiceStore.getState().mode(credentials.installationId)).toBe("deny");
    expect(campaignCounter.initializeNewRegistration).toHaveBeenCalledWith("meta-poster-a");
  });
  it("the explicitly labeled all-consent action grants both optional categories", async () => {
    fetchMock.mockResolvedValue({ ...credentials, qualityConsent: granted });
    render(
      <MemoryRouter>
        <BetaConsentPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/전체 동의에는 필수 약관과 선택 항목/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "전체 동의하고 시작" }));
    await waitFor(() => expect(useInstallationStore.getState().status).toBe("registered"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/installations",
      expect.objectContaining({
        body: expect.objectContaining({
          qualityConsent: { version: "2026-10-19", personalData: true, contentLicense: true },
        }),
      }),
    );
    expect(useAcquisitionChoiceStore.getState().mode(credentials.installationId)).toBe("allow");
  });
  it("selected consent can allow attribution without granting manuscript review", async () => {
    fetchMock.mockResolvedValue({ ...credentials, qualityConsent: NO_QUALITY_CONSENT });
    render(
      <MemoryRouter>
        <BetaConsentPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /필수/ }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /설치별 광고 유입·사용 이력 연결/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "선택한 항목만 동의하고 시작" }));
    await waitFor(() => expect(useInstallationStore.getState().status).toBe("registered"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/installations",
      expect.objectContaining({
        body: expect.objectContaining({
          qualityConsent: { version: "2026-10-19", personalData: false, contentLicense: false },
        }),
      }),
    );
    expect(useAcquisitionChoiceStore.getState().mode(credentials.installationId)).toBe("allow");
  });
  it("a failed registration does not persist an all-consent choice", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter>
        <BetaConsentPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "전체 동의하고 시작" }));
    await waitFor(() => expect(useInstallationStore.getState().error).not.toBeNull());
    expect(useAcquisitionChoiceStore.getState().choice).toBeNull();
    expect(campaignCounter.initializeNewRegistration).not.toHaveBeenCalled();
  });

  it("existing installations keep their identity and basic access if consent lookup is unavailable", async () => {
    vi.mocked(installationStorage.get).mockResolvedValue(credentials);
    fetchMock.mockRejectedValue(new Error("offline"));
    await useInstallationStore.getState().initialize();
    expect(useInstallationStore.getState()).toMatchObject({ status: "registered", credentials });
    expect(useQualityConsentStore.getState()).toMatchObject({
      loaded: false,
      consent: NO_QUALITY_CONSENT,
    });
    expect(installationStorage.clear).not.toHaveBeenCalled();
    expect(campaignCounter.initializeNewRegistration).not.toHaveBeenCalled();
  });

  it("unchecking one permission withdraws review only and keeps installation credentials", async () => {
    useInstallationStore.setState({ status: "registered", credentials });
    fetchMock
      .mockResolvedValueOnce(granted)
      .mockResolvedValueOnce({ ...NO_QUALITY_CONSENT, contentLicense: true });
    render(<QualityConsentSection />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")[0]).toBeChecked());
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: "품질 검토 설정 저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("저장했습니다");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/v1/installations/current/quality-consent",
      expect.objectContaining({
        method: "PUT",
        body: {
          version: "2026-10-19",
          personalData: false,
          contentLicense: true,
        },
      }),
    );
    expect(useInstallationStore.getState().credentials).toEqual(credentials);
    expect(installationStorage.clear).not.toHaveBeenCalled();
  });

  it("failed withdrawal remains visibly pending and can be retried", async () => {
    useQualityConsentStore.getState().accept(granted);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(
      await useQualityConsentStore.getState().save({ personalData: false, contentLicense: false }),
    ).toBe(false);
    expect(useQualityConsentStore.getState().error).toContain("서버에 반영되지 않았습니다");
    expect(useQualityConsentStore.getState().consent.consentId).toBe("grant-a");
    await useQualityConsentStore.getState().refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useQualityConsentStore.getState().pendingChoices).toEqual({
      personalData: false,
      contentLicense: false,
    });
    expect(useQualityConsentStore.getState().error).toContain("서버에 반영되지 않았습니다");
    fetchMock.mockResolvedValueOnce(NO_QUALITY_CONSENT);
    expect(
      await useQualityConsentStore.getState().save({ personalData: false, contentLicense: false }),
    ).toBe(true);
    expect(useQualityConsentStore.getState().consent.consentId).toBeNull();
  });

  it("a stale refresh cannot restore permission after withdrawal", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const refresh = useQualityConsentStore.getState().refresh();
    fetchMock.mockResolvedValueOnce(NO_QUALITY_CONSENT);
    await useQualityConsentStore.getState().save({ personalData: false, contentLicense: false });
    resolve(granted);
    await refresh;
    expect(useQualityConsentStore.getState().consent.consentId).toBeNull();
  });
});
