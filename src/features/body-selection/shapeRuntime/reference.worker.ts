import type { BlenderControls } from "./common";
import { evaluateReferenceWith } from "./referenceEvaluate";
import { ExactFemale } from "./referenceFemaleV4";
import { parseReferenceHeader, decodeReferenceArrays, inflateReference } from "./referenceFormat";
let evaluator: ExactFemale | undefined;
self.onmessage = (
  event: MessageEvent<
    | { kind: "init"; header: unknown; compressed: Uint8Array }
    | { kind: "compute"; controls: BlenderControls }
  >,
) => {
  try {
    const message = event.data;
    if (message.kind === "init") {
      const h = parseReferenceHeader(message.header);
      evaluator = new ExactFemale(
        h,
        decodeReferenceArrays(h, inflateReference(h, message.compressed)),
      );
      const faces = new Uint16Array(evaluator.a.faces);
      self.postMessage({ kind: "ready", faces }, { transfer: [faces.buffer] });
      return;
    }
    if (!evaluator) throw new Error("shape reference: worker not ready");
    const start = performance.now(),
      positions = evaluateReferenceWith(
        evaluator,
        message.controls,
        new Float32Array(evaluator.meta.vertexCount * 3),
      );
    self.postMessage(
      { kind: "result", positions, computeMs: performance.now() - start },
      { transfer: [positions.buffer] },
    );
  } catch {
    self.postMessage({ kind: "error" });
  }
};
