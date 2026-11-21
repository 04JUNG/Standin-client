import type { BodyPreferences } from "./contract";

/** Staging-only CSP export aliases, not extra user-facing presets.
 * Keep their assets/identities for existing selections and saved cards.
 * Approved new defaults such as male-default83-v0-7-6-p1 stay visible.
 */
export function isInternalCspPreset(id: string): boolean {
  return /^(male-(base|ideal83|ideal70|toon64|muscular|muscle-max|bulk|soft|fat-max)-v0-7-6|female-(base|slim|ideal83|ideal70|toon64|muscular|muscle-max|soft|fat-max|new-fat|new-muscular)-v0-3-9)$/.test(
    id,
  );
}

export function pickerIncludes(
  prefs: BodyPreferences | undefined | null,
  kind: "preset" | "card",
  id: string,
) {
  if (kind === "preset" && isInternalCspPreset(id)) return false;
  return !(
    kind === "preset"
      ? prefs?.pickerVisibility?.hiddenPresetIds
      : prefs?.pickerVisibility?.hiddenCardIds
  )?.includes(id);
}

export function changePickerVisibility(
  prefs: BodyPreferences,
  kind: "preset" | "card",
  id: string,
  included: boolean,
) {
  const current = prefs.pickerVisibility ?? { hiddenPresetIds: [], hiddenCardIds: [] };
  const key = kind === "preset" ? "hiddenPresetIds" : "hiddenCardIds";
  const ids = new Set(current[key]);
  if (included) ids.delete(id);
  else ids.add(id);
  return { ...current, [key]: [...ids].sort() };
}
