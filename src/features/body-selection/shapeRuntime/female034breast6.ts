import type { ShapeRuntime } from "./format";
import { accumulate, type BlenderControls } from "./common";
import { mappingsFemale022, warpFemale022 } from "./female022";
import { evaluateFemale033 } from "./female033";
import { anatomyWarp, normalsBuffer, type Warp } from "./anatomy";
import { faceNormals, foldGuard } from "./mesh";

/** Isolated authoring candidate; +1 keeps the old target, +2 adds a separate key. */
export const FEMALE_034_BREAST6 = "standin-female-body-0.3.4.breast6";

function mappings(runtime: ShapeRuntime, c: BlenderControls) {
  const weights = mappingsFemale022(runtime, c);
  weights.BODY_BreastLarge = Math.min(1, Math.max(0, c.breast_size!));
  weights.BODY_BreastSmallReference = weights.BODY_BreastSmall!;
  weights.BODY_BreastSmall = 0;
  weights.BODY_BreastExtended = 0;
  return weights;
}

export function evaluateFemale034Breast6(
  runtime: ShapeRuntime,
  c: BlenderControls,
  out: Float32Array,
) {
  if (c.breast_size! >= 0 && c.breast_size! <= 1)
    return evaluateFemale033(runtime, c, out, mappings);
  // Keep inherited fat/muscle filtering exact. Apply only the breast residual
  // afterwards, so a new breast does not change an arm's global surface choice.
  const reference = new Float64Array(out.length);
  evaluateFemale033(runtime, c, out, mappings, reference);
  const small = Math.max(0, -c.breast_size!);
  const large = Math.max(0, c.breast_size! - 1);
  const coefficients = new Map([
    ["D:BODY_BreastSmall", small],
    ["D:BODY_BreastSmallReference", -small],
    ["D:BODY_BreastExtended", large],
  ]);
  const delta = new Float64Array(out.length);
  accumulate(runtime, coefficients, delta);
  const points = new Float64Array(out.length);
  for (let i = 0; i < points.length; i++) points[i] = runtime.basis[i]! + delta[i]!;
  const parent: Warp = (cc, p, o) => warpFemale022(runtime, cc, p, o);
  const warp = anatomyWarp(runtime, "female", parent);
  const shifted = warp(c, points, new Float64Array(out.length));
  const original = warp(c, runtime.basis, new Float64Array(out.length));
  const body = new Float64Array(out.length);
  for (let i = 0; i < body.length; i++) body[i] = reference[i]! + shifted[i]! - original[i]!;
  const normals = normalsBuffer(runtime);
  foldGuard(runtime, reference, body, faceNormals(runtime, reference, reference, normals), 20, 3);
  out.set(body);
  return out;
}
