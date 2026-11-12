/** Proposed preview cap, reviewed on the supplied male/female surfaces. CSS pixels. */
export const MAX_OUTLINE_WIDTH = 2;
export const OUTLINE_SAMPLES = [0, 0.65, 1.2, MAX_OUTLINE_WIDTH] as const;

export function clampOutlineWidth(width: number) {
  return Number.isFinite(width) ? Math.min(MAX_OUTLINE_WIDTH, Math.max(0, width)) : 0;
}

/** One instance per job/viewer. Model, pose and skin changes do not change these values. */
export class PersonOutlineSettings {
  private widths = new Map<number, number>();

  get(personIndex: number) {
    return this.widths.get(personIndex) ?? 0;
  }

  set(personIndex: number, width: number) {
    if (!Number.isInteger(personIndex) || personIndex < 0) return;
    const value = clampOutlineWidth(width);
    if (value === 0) this.widths.delete(personIndex);
    else this.widths.set(personIndex, value);
  }

  /** New job, logout, or viewer disposal. No cross-job/session persistence. */
  clear() {
    this.widths.clear();
  }
}
