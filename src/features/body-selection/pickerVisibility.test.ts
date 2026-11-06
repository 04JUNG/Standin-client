import { describe, expect, it } from "vitest";
import { changePickerVisibility, isInternalCspPreset, pickerIncludes } from "./pickerVisibility";
import type { BodyPreferences } from "./contract";

describe("CSP aliases versus real product presets", () => {
  it("removes exactly the 20 known internal variants, preserving old bases and newly approved defaults", () => {
    const male = [
      "base",
      "ideal83",
      "ideal70",
      "toon64",
      "muscular",
      "muscle-max",
      "bulk",
      "soft",
      "fat-max",
    ].map((p) => `male-${p}-v0-7-6`);
    const female = [
      "base",
      "slim",
      "ideal83",
      "ideal70",
      "toon64",
      "muscular",
      "muscle-max",
      "soft",
      "fat-max",
      "new-fat",
      "new-muscular",
    ].map((p) => `female-${p}-v0-3-9`);
    expect([...male, ...female]).toHaveLength(20);
    for (const id of [...male, ...female]) expect(isInternalCspPreset(id)).toBe(true);
    for (const id of [
      "male-base-v0-7-2",
      "female-base-v0-3-4",
      "body-child",
      "male-default83-v0-7-6-p1",
      "female-default80-v0-3-9-p1",
    ])
      expect(isInternalCspPreset(id)).toBe(false);
  });
});

it("hides/restores presets and cards independently without deleting cards or changing last-used/mode", () => {
  const prefs: BodyPreferences = {
    version: "body-preferences.v1",
    scope: "installation",
    mode: "last_used",
    revision: 1,
    cards: [
      {
        cardId: "same-id",
        characterId: "male-base",
        name: "주인공",
        controls: {},
        createdAt: "",
        updatedAt: "",
      },
    ],
    lastUsed: { characterId: "male-base", controls: null, usedAt: "" },
  };
  const before = structuredClone(prefs);
  const hidden = {
    ...prefs,
    pickerVisibility: changePickerVisibility(prefs, "preset", "same-id", false),
  };
  expect(pickerIncludes(hidden, "preset", "same-id")).toBe(false);
  expect(pickerIncludes(hidden, "card", "same-id")).toBe(true);
  const both = {
    ...hidden,
    pickerVisibility: changePickerVisibility(hidden, "card", "same-id", false),
  };
  expect(pickerIncludes(both, "card", "same-id")).toBe(false);
  const restored = {
    ...both,
    pickerVisibility: changePickerVisibility(both, "card", "same-id", true),
  };
  expect(pickerIncludes(restored, "card", "same-id")).toBe(true);
  expect(restored.cards).toEqual(before.cards);
  expect(restored.lastUsed).toEqual(before.lastUsed);
  expect(prefs).toEqual(before);
  expect(pickerIncludes(undefined, "preset", "male-base")).toBe(true);
});
