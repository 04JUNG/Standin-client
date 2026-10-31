import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  native: true,
  env: {
    isProduction: true,
    useMockApi: false,
    useMockPoseApi: false,
    installCreative: "meta-poster-a",
  },
  getCredentials: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => runtime.native }));
vi.mock("@/shared/lib/env", () => ({ env: runtime.env }));
vi.mock("./installationStorage", () => ({
  installationStorage: { get: () => runtime.getCredentials() },
}));
import { installerCampaign, prepareInstallerCampaign } from "./installerCampaign";

beforeEach(() => {
  localStorage.clear();
  runtime.native = true;
  Object.assign(runtime.env, {
    isProduction: true,
    useMockApi: false,
    useMockPoseApi: false,
    installCreative: "meta-poster-a",
  });
  runtime.getCredentials.mockReset().mockResolvedValue(null);
});

describe("installer source at native startup", () => {
  it("captures a production package on a fresh installation", async () => {
    await prepareInstallerCampaign();
    expect(installerCampaign.consume()).toBe("meta-poster-a");
  });
  it("does not treat a keyring failure or existing registration as a new install", async () => {
    runtime.getCredentials.mockRejectedValueOnce(new Error("keyring unavailable"));
    await prepareInstallerCampaign();
    expect(installerCampaign.consume()).toBeNull();
    runtime.getCredentials.mockResolvedValue({ installationId: "existing" });
    await prepareInstallerCampaign();
    expect(installerCampaign.consume()).toBeNull();
  });
  it.each(["browser", "staging", "mock-api", "mock-pose"])(
    "does not capture in %s",
    async (mode) => {
      if (mode === "browser") runtime.native = false;
      if (mode === "staging") runtime.env.isProduction = false;
      if (mode === "mock-api") runtime.env.useMockApi = true;
      if (mode === "mock-pose") runtime.env.useMockPoseApi = true;
      await prepareInstallerCampaign();
      expect(runtime.getCredentials).not.toHaveBeenCalled();
      expect(installerCampaign.consume()).toBeNull();
    },
  );
});
