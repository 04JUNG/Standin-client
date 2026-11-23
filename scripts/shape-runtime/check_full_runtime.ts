/** Independent full-mesh comparison using the actual client parser/evaluator. */
import { readFileSync, writeFileSync } from "node:fs";
import { parseShapeRuntime } from "../../src/features/body-selection/shapeRuntime/format";
import { evaluateShape } from "../../src/features/body-selection/shapeRuntime/evaluate";

const [ssr, prefix, target] = process.argv.slice(2);
if (!ssr || !prefix || !target)
  throw new Error("usage: check_full_runtime <ssr> <dump-prefix> <report>");
const buf = readFileSync(ssr);
const runtime = parseShapeRuntime(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
);
const meta = JSON.parse(readFileSync(prefix + ".json", "utf8"));
const raw = readFileSync(prefix + ".bin");
const all = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8);
const n = runtime.header.vertexCount * 3;
if (all.length !== n * meta.names.length || meta.controls.length !== meta.names.length)
  throw new Error("controller dump dimensions differ");
const rows: {
  name: string;
  maxComponentErrorMm: number;
  maxVertexErrorMm: number;
  computeMs: number;
}[] = [];
for (let i = 0; i < meta.names.length; i++) {
  const started = performance.now();
  const got = evaluateShape(runtime, meta.controls[i]);
  let component = 0,
    vertex = 0;
  for (let j = 0; j < n; j += 3) {
    const x = got[j]! - all[i * n + j]!,
      y = got[j + 1]! - all[i * n + j + 1]!,
      z = got[j + 2]! - all[i * n + j + 2]!;
    component = Math.max(component, Math.abs(x), Math.abs(y), Math.abs(z));
    vertex = Math.max(vertex, Math.hypot(x, y, z));
  }
  rows.push({
    name: meta.names[i],
    maxComponentErrorMm: component * 1000,
    maxVertexErrorMm: vertex * 1000,
    computeMs: performance.now() - started,
  });
}
const worst = Math.max(...rows.map((r) => r.maxComponentErrorMm));
const report = {
  passed: worst < 0.05,
  independent: true,
  thresholdMm: 0.05,
  rules: runtime.header.rules,
  source: runtime.header.source,
  vertices: runtime.header.vertexCount,
  cases: rows.length,
  bytes: buf.byteLength,
  maxComponentErrorMm: worst,
  maxVertexErrorMm: Math.max(...rows.map((r) => r.maxVertexErrorMm)),
  rows,
};
writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, rows: undefined }));
if (!report.passed) process.exitCode = 1;
