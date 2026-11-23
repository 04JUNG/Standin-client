import type { ShapeRuntime } from "./format";
import type { BlenderControls } from "./common";
import { evaluateBreastResidual } from "./female034breast7";

/** Current 54-bone anatomy, with the original breast7 residual policy.
 * All rest geometry, weights, masks and fields are baked from the pinned 0.4.0
 * candidate. This rule requires its own source-bound runtime; old sources cannot
 * substitute for it. The neutral layers share the measured 0.3.3 equations.
 */
export const FEMALE_040_BREAST7 = "standin-female-body-0.4.0.breast7.2";

function evaluatePinnedFemale040(
  expectedRule: string,
  runtime: ShapeRuntime,
  controls: BlenderControls,
  out: Float32Array,
) {
  if (runtime.header.rules !== expectedRule || !runtime.header.source)
    throw new Error("female040 breast runtime requires its exact source identity");
  for (const name of ["BODY_BreastSmall", "BODY_BreastSmallReference", "BODY_BreastExtended"])
    if (!runtime.fields.has("D:" + name))
      throw new Error("female040 breast runtime missing " + name);
  return evaluateBreastResidual(runtime, controls, out);
}

export const FEMALE_040_BREAST7_POSE_GUARD = "standin-female-body-0.4.0.breast7.4";

export function evaluateFemale040Breast7(
  runtime: ShapeRuntime,
  controls: BlenderControls,
  out: Float32Array,
) {
  return evaluatePinnedFemale040(FEMALE_040_BREAST7, runtime, controls, out);
}

/** Same exact neutral equations; the separately pinned controller adds only a pose correction. */
export function evaluateFemale040Breast7PoseGuard(
  runtime: ShapeRuntime,
  controls: BlenderControls,
  out: Float32Array,
) {
  return evaluatePinnedFemale040(FEMALE_040_BREAST7_POSE_GUARD, runtime, controls, out);
}
