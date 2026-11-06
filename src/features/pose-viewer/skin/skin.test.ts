import { expect, it } from "vitest";
import { sameSkin, selectedSkin, skinSchema } from "./skin";
it("omits default to preserve legacy request identity and compares separate skin choices", () => {
  expect(selectedSkin()).toBeUndefined();
  expect(selectedSkin("default")).toBeUndefined();
  expect(selectedSkin("flesh-guide")).toEqual({ version: "fbx-skin-v1", id: "flesh-guide" });
  expect(sameSkin(undefined, { version: "fbx-skin-v1", id: "default" })).toBe(true);
  expect(sameSkin(selectedSkin("flesh"), selectedSkin("muscle"))).toBe(false);
});
it.each([
  { version: "fbx-skin-v1", id: "custom" },
  { version: "fbx-skin-v1", id: "flesh", url: "https://example.com/custom.png" },
  { version: "fbx-skin-v1", id: "flesh", path: "/tmp/custom.png" },
  { version: "fbx-skin-v1", id: "flesh", width: 2 },
  { version: "fbx-outline-v1", id: "flesh" },
])("rejects noncontract IDs, uploads, paths and mixed outline settings %#", (raw) => {
  expect(skinSchema.safeParse(raw).success).toBe(false);
});
