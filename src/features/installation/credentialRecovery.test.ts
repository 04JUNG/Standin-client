import { beforeEach, expect, it, vi } from "vitest";
import { useInstallationStore, CONSENT_VERSION } from "./installationStore";
import { installationStorage, type InstallationCredentials } from "./installationStorage";
import { setInstallationCredentials } from "@/shared/api/client";

vi.mock("./installationStorage", () => ({ installationStorage: { get: vi.fn() } }));
vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn(), setInstallationCredentials: vi.fn() }));

const original = { installationId: "inst_current", deviceToken: "old-test-token", consentVersion: CONSENT_VERSION };
beforeEach(() => {
  vi.clearAllMocks();
  useInstallationStore.setState({ status: "registered", credentials: original });
});

it("restores the same installation from secure storage without re-registering", async () => {
  const current = { ...original, deviceToken: "updated-test-token" };
  vi.mocked(installationStorage.get).mockResolvedValue(current);
  expect(await useInstallationStore.getState().reloadCredentials()).toBe(true);
  expect(setInstallationCredentials).toHaveBeenCalledWith(current);
  expect(useInstallationStore.getState().credentials).toEqual(current);
});

it.each([null, { ...original, installationId: "inst_other" }, { ...original, consentVersion: "old" }])(
  "does not replace the current identity with missing, different-owner or old-consent credentials: %j",
  async (saved) => {
    vi.mocked(installationStorage.get).mockResolvedValue(saved);
    expect(await useInstallationStore.getState().reloadCredentials()).toBe(false);
    expect(setInstallationCredentials).not.toHaveBeenCalled();
    expect(useInstallationStore.getState().credentials).toEqual(original);
  },
);

it("does not restore stale credentials after withdrawal while secure storage is loading", async () => {
  let finish: (credentials: InstallationCredentials) => void = () => {};
  vi.mocked(installationStorage.get).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = useInstallationStore.getState().reloadCredentials();
  useInstallationStore.setState({ status: "consent_required", credentials: null });
  finish(original);
  expect(await pending).toBe(false);
  expect(setInstallationCredentials).not.toHaveBeenCalled();
});
