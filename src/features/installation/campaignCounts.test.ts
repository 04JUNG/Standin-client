import { describe, it, expect, vi } from "vitest";
import { createCampaignCounter, sendCampaignCount } from "./campaignCounts";

function fixture(failStorage = false) {
  let now = 1000000000;
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failStorage) throw Error("disk");
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  const send = vi.fn<(value: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const counter = createCampaignCounter({ storage, send, enabled: true, now: () => now });
  return {
    counter,
    send,
    data,
    storage,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
describe("shared campaign counters", () => {
  it("uses credential-free transport without query, referrer or identity headers", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    try {
      await sendCampaignCount({ v: 1, creative: "meta-hook-a", event: "first_run" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(new URL(String(url)).search).toBe("");
      expect(init).toMatchObject({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      expect(Object.keys(init!.headers!)).toEqual(["Content-Type"]);
      expect(JSON.parse(String(init!.body))).toEqual({
        v: 1,
        creative: "meta-hook-a",
        event: "first_run",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("never retroactively counts existing installs without new registration", () => {
    const { counter, send } = fixture();
    counter.receive("meta-poster-a");
    counter.analysisStarted("private");
    counter.analysisSucceeded("private");
    expect(send).not.toHaveBeenCalled();
  });
  it("counts first source only and a new successful analysis without any consent or identity input", () => {
    const { counter, send, data } = fixture();
    counter.initializeNewRegistration("meta-poster-a");
    counter.receive("meta-hook-a");
    counter.analysisSucceeded("history");
    expect(send).toHaveBeenCalledTimes(1);
    counter.analysisStarted("private-job");
    counter.analysisSucceeded("private-job");
    counter.analysisSucceeded("private-job");
    counter.analysisStarted("another");
    counter.analysisSucceeded("another");
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      { v: 1, creative: "meta-poster-a", event: "first_run" },
      { v: 1, creative: "meta-poster-a", event: "first_analysis_success" },
    ]);
    expect([...data.values()].join()).not.toMatch(/meta-poster-a|private-job/);
  });
  it("accepts a later link only during the first 24 hours and expires after 7 days", () => {
    const a = fixture();
    a.counter.initializeNewRegistration(null);
    a.advance(86400000 + 1);
    a.counter.receive("meta-hook-a");
    expect(a.send).not.toHaveBeenCalled();
    const b = fixture();
    b.counter.initializeNewRegistration(null);
    b.counter.receive("meta-hook-a");
    b.counter.analysisStarted("job");
    b.advance(7 * 86400000);
    b.counter.analysisSucceeded("job");
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(b.data.size).toBe(0);
  });
  it("retains local once-only state across process restart and never counts older results", () => {
    const f = fixture();
    f.counter.initializeNewRegistration("meta-hook-a");
    f.counter.analysisStarted("old-process-job");
    const restart = createCampaignCounter({
      storage: f.storage,
      send: f.send,
      enabled: true,
      now: f.now,
    });
    restart.receive("meta-hook-a");
    restart.analysisSucceeded("old-process-job");
    expect(f.send).toHaveBeenCalledTimes(1);
    restart.analysisStarted("fresh");
    restart.analysisSucceeded("fresh");
    expect(f.send).toHaveBeenCalledTimes(2);
  });
  it("reserves before sending, does not retry network failures, and fails closed on storage failure", async () => {
    const f = fixture();
    f.send.mockRejectedValue(Error("offline"));
    f.counter.initializeNewRegistration("meta-hook-a");
    f.counter.receive("meta-hook-a");
    await Promise.resolve();
    expect(f.send).toHaveBeenCalledTimes(1);
    const disk = fixture(true);
    disk.counter.initializeNewRegistration("meta-hook-a");
    expect(disk.send).not.toHaveBeenCalled();
    const bad = fixture();
    bad.send.mockImplementation(() => {
      throw Error("sync");
    });
    expect(() => bad.counter.initializeNewRegistration("meta-hook-a")).not.toThrow();
  });
  it("clears local campaign on withdrawal and does not send in disabled environments", () => {
    const f = fixture();
    f.counter.initializeNewRegistration("meta-hook-a");
    f.counter.analysisStarted("job");
    f.counter.clear();
    f.counter.analysisSucceeded("job");
    expect(f.send).toHaveBeenCalledTimes(1);
    const disabled = createCampaignCounter({ storage: f.storage, send: f.send, enabled: false });
    disabled.initializeNewRegistration("meta-poster-a");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
