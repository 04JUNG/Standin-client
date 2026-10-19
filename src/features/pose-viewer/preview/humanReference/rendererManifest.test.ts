import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import manifest from "./renderer-manifest.json";
it("pins the actual skinning/framing/style sources used by offline source-bound posters", () => {
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  for (const [file, sha] of Object.entries(manifest.client_source_sha256))
    expect(
      digest(
        readFileSync(new URL("../../" + file, import.meta.url), "utf8").replace(/\r\n/g, "\n"),
      ),
      file,
    ).toBe(sha);
  const canonical =
    "{" +
    Object.entries(manifest.client_source_sha256)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v))
      .join(", ") +
    "}";
  expect(digest(canonical)).toBe(manifest.algorithm_sha256);
});
