import { describe, it, expect } from "vitest";
import { createInstallerCampaign } from "./installerCampaign";

function fixture() {
  const data = new Map<string, string>();
  let now = 1000000000;
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  return {
    data,
    storage,
    advance: (ms: number) => {
      now += ms;
    },
    create: () => createInstallerCampaign({ storage, now: () => now }),
  };
}
describe("shared installer source", () => {
  it.each(["meta-poster-a", "meta-hook-a"])(
    "survives a generic update and is consumed once: %s",
    (creative) => {
      const f = fixture();
      f.create().capture(creative, false);
      const restarted = f.create();
      restarted.capture("", false);
      expect(restarted.consume()).toBe(creative);
      expect(restarted.consume()).toBeNull();
      restarted.capture(creative, false);
      expect(restarted.consume()).toBeNull();
      expect([...f.data.values()].join()).not.toContain(creative);
    },
  );
  it("never attributes an existing installation or overwrites the first package", () => {
    const f = fixture();
    const a = f.create();
    a.capture("meta-poster-a", false);
    a.capture("meta-hook-a", false);
    expect(a.consume()).toBe("meta-poster-a");
    a.clear();
    a.capture("meta-hook-a", false);
    a.capture("meta-poster-a", true);
    expect(a.consume()).toBeNull();
    expect(f.data.size).toBe(0);
  });
  it("expires the unregistered source without recapturing the same package", () => {
    const f = fixture();
    f.create().capture("meta-hook-a", false);
    f.advance(7 * 86400000);
    f.create().capture("meta-hook-a", false);
    expect(f.create().consume()).toBeNull();
    expect([...f.data.values()].join()).not.toContain("meta-hook-a");
  });
  it("ignores arbitrary labels and fails closed if storage fails", () => {
    const f = fixture();
    for (const label of ["", "user-42", "meta-poster-a?fbclid=secret", null])
      f.create().capture(label, false);
    expect(f.data.size).toBe(0);
    const failed = createInstallerCampaign({
      storage: {
        ...f.storage,
        setItem: () => {
          throw Error("disk");
        },
      },
    });
    failed.capture("meta-poster-a", false);
    expect(failed.consume()).toBeNull();
    f.create().capture("meta-hook-a", false);
    expect(failed.consume()).toBeNull();
  });
});
