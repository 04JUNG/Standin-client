import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AcquisitionConsent, AcquisitionSettings } from "./AcquisitionConsent";
import { useAcquisitionStore } from "./acquisitionStore";
import { apiFetch } from "@/shared/api/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/plugin-deep-link", () => ({ getCurrent: vi.fn(), onOpenUrl: vi.fn() }));
vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("./installationStore", () => ({
  useInstallationStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: "registered" }),
}));
beforeEach(() => {
  cleanup();
  vi.mocked(isTauri).mockReturnValue(false);
  vi.mocked(apiFetch).mockReset();
  useAcquisitionStore.setState({ pending: "meta-poster-a" });
});
describe("optional acquisition consent", () => {
  it("receives cold and warm native links without sending before consent, and unsubscribes", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    useAcquisitionStore.setState({ pending: null });
    const stop = vi.fn();
    let receive: ((urls: string[]) => void) | undefined;
    vi.mocked(onOpenUrl).mockImplementation(async (handler) => {
      receive = handler;
      return stop;
    });
    vi.mocked(getCurrent).mockResolvedValue([
      "standin-dev://campaign?source=instagram&campaign=open-beta&creative=meta-poster-a",
    ]);
    const view = render(<AcquisitionConsent />);
    await waitFor(() => expect(useAcquisitionStore.getState().pending).toBe("meta-poster-a"));
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "연결하지 않고 계속" }));
    receive?.(["standin-dev://campaign?source=instagram&campaign=open-beta&creative=meta-hook-a"]);
    await waitFor(() => expect(useAcquisitionStore.getState().pending).toBe("meta-hook-a"));
    expect(apiFetch).not.toHaveBeenCalled();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
  it("does not send on open or rejection", () => {
    render(<AcquisitionConsent />);
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "연결하지 않고 계속" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useAcquisitionStore.getState().pending).toBeNull();
  });
  it("sends only allowlisted source and explicit consent after agreeing", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ creative: "meta-poster-a" });
    render(<AcquisitionConsent />);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 연결" }));
    await waitFor(() => expect(useAcquisitionStore.getState().pending).toBeNull());
    expect(apiFetch).toHaveBeenCalledWith("/v1/installations/current/acquisition", {
      method: "POST",
      auth: false,
      body: { creative: "meta-poster-a", version: "2026-10-29", consent: true },
    });
  });
  it("failed connection retains reject escape and does not pretend success", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
    render(<AcquisitionConsent />);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 연결" }));
    await screen.findByRole("alert");
    expect(useAcquisitionStore.getState().pending).toBe("meta-poster-a");
    fireEvent.click(screen.getByRole("button", { name: "연결하지 않고 계속" }));
    expect(useAcquisitionStore.getState().pending).toBeNull();
  });
  it("withdrawal uses authenticated delete, leaving installation intact", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ creative: null });
    render(<AcquisitionSettings />);
    fireEvent.click(screen.getByRole("button", { name: "광고 유입 연결 해제" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("해제했습니다"));
    expect(apiFetch).toHaveBeenCalledWith("/v1/installations/current/acquisition", {
      method: "DELETE",
      auth: false,
    });
  });
});
