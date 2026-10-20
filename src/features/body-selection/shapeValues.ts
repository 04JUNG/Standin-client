import type { ShapeSpec } from "./contract";

/** 체형의 처음 값(조절 바 기본값). */
export const shapeDefaults = (spec: ShapeSpec) =>
  Object.fromEntries(spec.controls.map((c) => [c.key, c.default]));

/** 두 수치가 같은 체형인가(빠진 key는 처음 값으로 본다). */
export function sameShape(
  spec: ShapeSpec,
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
) {
  return spec.controls.every(
    (c) => Math.abs((a?.[c.key] ?? c.default) - (b?.[c.key] ?? c.default)) < 1e-6,
  );
}
