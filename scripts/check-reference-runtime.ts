/** Compile with esbuild --bundle --platform=node --format=esm, then pass a
 * source-generated cases.json and an output report. No browser substitutes. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseShapeRuntime } from "../src/features/body-selection/shapeRuntime/format";
import { evaluateShape } from "../src/features/body-selection/shapeRuntime/evaluate";
import { resolveControls } from "../src/features/body-selection/shapeRuntime/evaluate";
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("cases.json and report path required");
const inputBytes = await readFile(input),
  fixture = JSON.parse(inputBytes.toString()) as {
    runtime: string;
    runtimeSha256: string;
    catalogSha256: string;
    cases: {
      id: string;
      preset: string;
      mode: string;
      controls: Record<string, number>;
      truthFile: string;
      truthSha256: string;
    }[];
  };
if (!fixture.cases.length || fixture.cases.length > 4096) throw new Error("case count");
const raw = await readFile(fixture.runtime);
if (sha(raw) !== fixture.runtimeSha256) throw new Error("runtime identity");
const runtime = parseShapeRuntime(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
);
if (runtime.kind !== "reference") throw new Error("reference codec required");
const rows = [];
for (const c of fixture.cases) {
  const bytes = await readFile(c.truthFile);
  if (sha(bytes) !== c.truthSha256 || bytes.length !== runtime.header.vertexCount * 3 * 8)
    throw new Error("source golden identity");
  const truth = new Float64Array(bytes.buffer, bytes.byteOffset, bytes.length / 8),
    t = performance.now(),
    result = evaluateShape(
      runtime,
      resolveControls(runtime, c.preset, c.controls),
      undefined,
      c.preset,
    ),
    elapsed = performance.now() - t;
  let max = 0,
    total = 0;
  for (let i = 0; i < result.length; i += 3) {
    let d = 0;
    for (let k = 0; k < 3; k++) d += (result[i + k] - truth[i + k]) ** 2;
    max = Math.max(max, d);
    total += d;
  }
  const row = {
    id: c.id,
    preset: c.preset,
    mode: c.mode,
    maxErrorMm: Math.sqrt(max) * 1000,
    rmsErrorMm: Math.sqrt(total / runtime.header.vertexCount) * 1000,
    evaluationMs: elapsed,
  };
  rows.push(row);
  console.log("ACTUAL_REFERENCE_CLIENT_CASE", JSON.stringify(row));
}
await writeFile(
  output,
  JSON.stringify(
    {
      runtimeSha256: sha(raw),
      catalogSha256: fixture.catalogSha256,
      inputCasesSha256: sha(inputBytes),
      clientEvaluatorSha256: sha(await readFile(fileURLToPath(import.meta.url))),
      source: runtime.header.source,
      actualClientParserAndEvaluator: true,
      rows,
    },
    null,
    2,
  ) + "\n",
);
