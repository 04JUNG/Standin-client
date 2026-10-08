import { describe, expect, it } from "vitest";
import {
  framedExportUrl,
  rememberFramedFormat,
  reviewedExportUrl,
  reviewedModelFormat,
} from "./framedExport";
describe("framed export URL", () => {
  it("pins the reviewed source and model identity and clears pins on PNG fallback", () => {
    const key = "identity-test";
    rememberFramedFormat(key, true, {
      sourceSha: "a".repeat(64),
      characterSha: "b".repeat(64),
      revision: "c".repeat(64),
    });
    const url = new URL(reviewedExportUrl("/framed?format=fbx", key), "https://test.invalid");
    expect(url.searchParams.get("expectedBvhSha256")).toBe("a".repeat(64));
    expect(url.searchParams.get("expectedCharacterSha256")).toBe("b".repeat(64));
    expect(url.searchParams.get("expectedModelRevision")).toBe("c".repeat(64));
    rememberFramedFormat(key, false);
    expect(reviewedModelFormat(key, true)).toBe(false);
    expect(reviewedExportUrl("/framed?format=fbx", key)).toBe("/framed?format=fbx");
  });
  it("preview and FBX preserve ownership and select the same scope and character", () => {
    const source =
      "/v1/pose-candidates/pose/export?jobId=job&personIndex=1&candidateId=pose%3A%3Aside&format=bvh";
    const preview = new URL(
      framedExportUrl(source, "head", "preview", "model-a"),
      "https://test.invalid",
    );
    const fbx = new URL(framedExportUrl(source, "head", "fbx", "model-a"), "https://test.invalid");
    expect(fbx.pathname).toBe("/v1/pose-candidates/pose/framed");
    expect(fbx.searchParams.getAll("format")).toEqual(["fbx"]);
    preview.searchParams.set("format", "fbx");
    expect(preview.href).toBe(fbx.href);
    expect(fbx.searchParams.get("candidateId")).toBe("pose::side");
  });
  it("rejects unrelated endpoints and removes stale character parameters", () => {
    expect(() => framedExportUrl("/refined/private-handle", "half", "fbx", null)).toThrow();
    expect(
      framedExportUrl("/v1/pose-candidates/p/export?characterId=stale", "half", "fbx", null),
    ).not.toContain("characterId");
  });
});
