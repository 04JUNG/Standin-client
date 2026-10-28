import { describe, it, expect } from "vitest";
import { parseAcquisitionUrl } from "./acquisitionStore";
describe("campaign app handoff", () => {
  const link = "standin://campaign?source=instagram&campaign=open-beta&creative=meta-poster-a";
  it("accepts only the production campaign allowlist", () => {
    expect(parseAcquisitionUrl(link, "production")).toBe("meta-poster-a");
    expect(parseAcquisitionUrl(link.replace("meta-poster-a", "meta-hook-a"), "production")).toBe(
      "meta-hook-a",
    );
  });
  it("accepts the root slash added by Windows protocol launch for both creatives", () => {
    for (const creative of ["meta-poster-a", "meta-hook-a"] as const) {
      const received = `standin://campaign/?source=instagram&campaign=open-beta&creative=${creative}`;
      expect(parseAcquisitionUrl(received, "production")).toBe(creative);
      expect(
        parseAcquisitionUrl(received.replace("campaign/?", "campaign/extra?"), "production"),
      ).toBeNull();
      expect(
        parseAcquisitionUrl(received.replace("campaign/?", "campaign//?"), "production"),
      ).toBeNull();
    }
  });
  it("does not associate auth links, unknown values, extra identifiers or other environments", () => {
    for (const url of [
      link.replace("standin:", "https:"),
      link.replace("campaign?", "auth/callback?"),
      link + "&email=a",
      link + "&creative=meta-hook-a",
      link.replace("meta-poster-a", "other"),
      link + "#x",
    ])
      expect(parseAcquisitionUrl(url, "production")).toBeNull();
    expect(parseAcquisitionUrl(link, "staging")).toBeNull();
  });
});
