import { describe, it, expect, vi } from "vitest";
import { createJourneyClient, parseJourneyUrl } from "./journeyClient";
import { apiFetch } from "@/shared/api/client";
const token = "a".repeat(43);
const link = {
  id: crypto.randomUUID(),
  consentedAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe("consented journey telemetry", () => {
  it("only accepts the correct environment, one token and known URI shape", () => {
    expect(parseJourneyUrl("standin://journey?token=" + token, "production")).toBe(token);
    for (const url of [
      "https://journey?token=" + token,
      "standin://journey?token=" + token + "&email=x",
      "standin://journey?token=" + token + "&token=" + token,
      "standin://journey/extra?token=" + token,
      "standin://journey?token=bad",
      "standin-dev://journey?token=" + token,
    ])
      expect(parseJourneyUrl(url, "production")).toBeNull();
  });
  it("does not collect before a confirmed receipt and sends only the small event allowlist", async () => {
    const request = vi.fn().mockResolvedValue({ link }),
      s = storage(),
      client = createJourneyClient(request as typeof apiFetch, s);
    client.setInstallation("one");
    client.track("export_completed");
    expect(request).not.toHaveBeenCalled();
    await client.claim(token);
    await settle();
    request.mockClear();
    client.track("input_confirmed");
    await settle();
    client.track("typed_private_text");
    await settle();
    const events = request.mock.calls
      .filter((c) => c[0].endsWith("/events"))
      .flatMap((c) => c[1].body.events);
    expect(events.map((e) => e.name)).toEqual(["input_confirmed"]);
    expect(Object.keys(events[0]).sort()).toEqual(["at", "id", "name"]);
  });
  it("withdrawal immediately blocks collection and prevents a late claim response restoring consent", async () => {
    let finish!: (v: unknown) => void;
    const request = vi.fn().mockImplementation((_path, options) =>
      options?.method === "POST"
        ? new Promise((r) => {
            finish = r;
          })
        : Promise.resolve({ link: null }),
    );
    const client = createJourneyClient(request as typeof apiFetch, storage());
    client.setInstallation("one");
    const claim = client.claim(token);
    await settle();
    const revoke = client.revoke();
    client.track("export_completed");
    finish({ link });
    await claim;
    await revoke;
    await settle();
    expect(client.link()).toBeNull();
    expect(request.mock.calls.some((c) => c[0].endsWith("/events"))).toBe(false);
    expect(request.mock.calls.at(-1)?.[1].method).toBe("DELETE");
  });
  it("failed withdrawal persists an opt-out and retries deletion before any refresh", async () => {
    const s = storage(),
      request = vi.fn().mockResolvedValue({ link });
    const client = createJourneyClient(request as typeof apiFetch, s);
    client.setInstallation("one");
    await client.claim(token);
    await settle();
    request.mockRejectedValueOnce(Error("offline"));
    await expect(client.revoke()).rejects.toThrow();
    expect(client.pendingRevoke()).toBe(true);
    const resumedRequest = vi.fn().mockResolvedValue({ link: null });
    const resumed = createJourneyClient(resumedRequest as typeof apiFetch, s);
    resumed.setInstallation("one");
    await resumed.refresh();
    expect(resumedRequest.mock.calls[0][1].method).toBe("DELETE");
    expect(resumed.link()).toBeNull();
    expect(resumed.pendingRevoke()).toBe(false);
  });
  it("queued events from another consent receipt are never reassigned", async () => {
    const s = storage();
    s.setItem(
      "standin.journey.queue.v1",
      JSON.stringify([
        {
          receipt: crypto.randomUUID(),
          id: crypto.randomUUID(),
          name: "export_completed",
          at: new Date().toISOString(),
        },
      ]),
    );
    const request = vi.fn().mockResolvedValue({ link });
    const client = createJourneyClient(request as typeof apiFetch, s);
    client.setInstallation("one");
    await client.refresh();
    await settle();
    const events = request.mock.calls
      .filter((c) => c[0].endsWith("/events"))
      .flatMap((c) => c[1].body.events);
    expect(events.map((e) => e.name)).toEqual(["app_started"]);
  });
});
