import { ExactFemale } from "./referenceFemaleV4";
import { decodeReferenceArrays, inflateReference, type ReferenceRuntime } from "./referenceFormat";
import type { BlenderControls } from "./common";
const evaluators = new WeakMap<ReferenceRuntime, ExactFemale>();
export function referenceEvaluator(runtime: ReferenceRuntime) {
  let evaluator = evaluators.get(runtime);
  if (!evaluator) {
    evaluator = new ExactFemale(
      runtime.header,
      decodeReferenceArrays(runtime.header, inflateReference(runtime.header, runtime.compressed)),
    );
    evaluators.set(runtime, evaluator);
  }
  return evaluator;
}
/** Source normalization is round(value, 6), including ties to even. Decode the
 * IEEE binary value so negative and half-way inputs agree with Python round. */
export function roundSourceControl(value: number): number {
  const bytes = new ArrayBuffer(8),
    view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false),
    negative = bits >> 63n !== 0n,
    exp = Number((bits >> 52n) & 2047n),
    fraction = bits & ((1n << 52n) - 1n);
  let numerator = (exp ? fraction + (1n << 52n) : fraction) * 1000000n;
  const shift = (exp ? exp - 1023 : -1022) - 52;
  if (shift >= 0) numerator <<= BigInt(shift);
  else {
    const denominator = 1n << BigInt(-shift),
      quotient = numerator / denominator,
      remainder = numerator % denominator;
    numerator =
      quotient +
      (remainder * 2n > denominator || (remainder * 2n === denominator && (quotient & 1n) !== 0n)
        ? 1n
        : 0n);
  }
  return (negative ? -Number(numerator) : Number(numerator)) / 1e6;
}
export function evaluateReferenceWith(
  evaluator: ExactFemale,
  controls: BlenderControls,
  out: Float32Array,
) {
  const runtime = { header: evaluator.meta };
  for (const [key, spec] of Object.entries(runtime.header.controls))
    if (!Number.isFinite(controls[key]) || controls[key] < spec.min || controls[key] > spec.max)
      throw new Error("shape reference: control range");
  if (out.length !== runtime.header.vertexCount * 3)
    throw new Error("shape reference: output size");
  // The pinned controller normalizes published inputs to six decimal places.
  const c = Object.fromEntries(
    Object.entries(controls).map(([key, value]) => [key, roundSourceControl(value)]),
  );
  out.set(evaluator.preview(c));
  return out;
}

export function evaluateReference(
  runtime: ReferenceRuntime,
  controls: BlenderControls,
  out: Float32Array,
) {
  return evaluateReferenceWith(referenceEvaluator(runtime), controls, out);
}
