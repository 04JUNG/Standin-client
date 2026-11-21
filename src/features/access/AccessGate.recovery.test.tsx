import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessGate } from "./AccessGate";
import { useInstallationStore, CONSENT_VERSION } from "@/features/installation/installationStore";
import { installationStorage } from "@/features/installation/installationStorage";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { useAccessStore } from "@/shared/stores/accessStore";

vi.mock("@/features/installation/installationStorage", () => ({ installationStorage: { get: vi.fn() } }));
vi.mock("@/shared/lib/env", () => ({ env: {
  useMockApi: false, isProduction: true, apiBaseUrl: "https://fixture.invalid",
} }));

const old = { installationId: "inst_test", deviceToken: "old-test-token", consentVersion: CONSENT_VERSION };
beforeEach(() => {
  __resetApiClient();
  useAccessStore.setState({ phase: "unknown" });
  useInstallationStore.setState({ status: "registered", credentials: old });
  setInstallationCredentials(old);
  vi.mocked(installationStorage.get).mockResolvedValue({ ...old, deviceToken: "restored-test-token" });
});
afterEach(() => { vi.unstubAllGlobals(); __resetApiClient(); });

it.each([true, false])("real API headers change after secure-store restoration; server allowed=%s", async (allowed) => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: { code: "INVALID_INSTALLATION", message: "invalid" } }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ required: true, allowed, role: allowed ? "operator" : null }));
  vi.stubGlobal("fetch", fetch);
  render(<AccessGate><span>PRODUCT</span></AccessGate>);
  if (allowed) await screen.findByText("PRODUCT");
  else {
    await screen.findByLabelText("이용 코드");
    expect(screen.queryByText("PRODUCT")).not.toBeInTheDocument();
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [index, token] of [[1, "old-test-token"], [2, "restored-test-token"]] as const)
    expect(fetch).toHaveBeenNthCalledWith(index,
      "https://fixture.invalid/v1/installations/current/access",
      expect.objectContaining({ headers: expect.objectContaining({
        "X-Installation-Id": "inst_test", "X-Device-Token": token,
      }) }),
    );
});
