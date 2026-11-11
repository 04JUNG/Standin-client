import { expect, it } from "vitest";
import { isSupportedClientVersion } from "./clientVersion";

it.each(["0.2.0", "0.2.0+build.7", "0.2.3", "0.10.0", "1.0.0"])(
  "accepts supported desktop %s",
  (version) => {
    expect(isSupportedClientVersion(version)).toBe(true);
  },
);
it.each([undefined, "", "garbage", "0.1.99", "0.2.0-beta.1", "0.2.0-rc.1", "0.02.0", "0.2"])(
  "rejects unsupported desktop %s",
  (version) => {
    expect(isSupportedClientVersion(version)).toBe(false);
  },
);
