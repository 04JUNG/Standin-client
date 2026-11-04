import { describe, expect, it } from "vitest";
import { bodyKind, bodyRoleLabel, initialBodyLook, sortBodyLooks } from "./bodyPanel";
import { optionsSchema, preferencesSchema, type BodyLook } from "./contract";

const looks: BodyLook[] = [
  {
    characterId: "old-male",
    displayName: "기존 기본형",
    gender: "male",
    role: "previous_default",
    order: 0,
  },
  {
    characterId: "old-female",
    displayName: "기존 기본형",
    gender: "female",
    role: "previous_default",
    order: 1,
  },
  {
    characterId: "new-female",
    displayName: "기본형 · 8등신",
    gender: "female",
    role: "default",
    order: 20,
  },
  {
    characterId: "new-male",
    displayName: "기본형 · 8.3등신",
    gender: "male",
    role: "default",
    order: 10,
  },
];
describe("approved default roles", () => {
  it("uses explicit gender and the gender's default even when preserved BASE is first", () => {
    expect(bodyKind({ characterId: "male-coded-id", gender: "female" })).toBe("female");
    expect(initialBodyLook(looks, "female")?.characterId).toBe("new-female");
    expect(initialBodyLook(looks, "male")?.characterId).toBe("new-male");
    expect(initialBodyLook(sortBodyLooks(looks))?.characterId).toBe("new-male");
    expect(sortBodyLooks(looks).map((l) => l.characterId)).toEqual([
      "new-male",
      "new-female",
      "old-male",
      "old-female",
    ]);
    expect(looks[0].characterId).toBe("old-male");
    expect(bodyRoleLabel(looks[0])).toBe("기존 기본형");
    expect(bodyRoleLabel(looks[2])).toBe("기본");
  });
  it("keeps old catalogs in their original order and retains metadata in options/preferences", () => {
    const old = [
      { characterId: "female-base", displayName: "기본형" },
      { characterId: "male-base" },
    ];
    expect(sortBodyLooks(old)).toEqual(old);
    expect(initialBodyLook(old, "female")).toBe(old[0]);
    const bodyRef = {
      characterId: "new-male",
      bodyId: "new-male",
      bodyVersion: "fixture",
      rigVersion: "fixture",
      measurementVersion: "fixture",
      assetSha256: "a".repeat(64),
    };
    const spec = {
      schemaVersion: "body-shape.v1",
      controls: [{ key: "heads", min: 7, max: 9, step: 0.1, default: 8.3 }],
    };
    const option = { ...looks[3], bodyRef, selectable: true, reasonCodes: [], shape: spec };
    expect(
      optionsSchema.parse({ catalogRevision: "fixture", characters: [option] }).characters[0],
    ).toMatchObject(looks[3]);
    expect(
      preferencesSchema.parse({
        version: "body-preferences.v1",
        scope: "installation",
        mode: "last_used",
        revision: 0,
        shapeEditable: [option],
      }).shapeEditable?.[0],
    ).toMatchObject(looks[3]);
  });
});
