import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseShapeRuntime } from "./format";
import { evaluateShape } from "./evaluate";

/**
 * 전체 메시 대조(기본은 건너뜀). build_runtime.py --dump 결과를 bin/json으로 바꾼 뒤:
 *   SHAPE_RUNTIME_FULL=<.ssr>:<prefix> npx vitest run evaluate.full
 * prefix.json(cases), prefix.bin(케이스×정점×3 float64, 컨트롤러의 실제 출력).
 */
const spec = process.env.SHAPE_RUNTIME_FULL;
describe.skipIf(!spec)("shape runtime — full mesh against the controller", () => {
  const [ssr, prefix] = (spec ?? ":").split(":");
  it("matches every dumped case within 0.05 mm", () => {
    const buf = readFileSync(ssr!);
    const runtime = parseShapeRuntime(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    const meta = JSON.parse(readFileSync(prefix + ".json", "utf8")) as {
      names: string[];
      controls: Record<string, number>[];
    };
    const raw = readFileSync(prefix + ".bin");
    const all = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8);
    const n = runtime.header.vertexCount * 3;
    const rows: string[] = [];
    let worst = 0;
    meta.names.forEach((name, i) => {
      const t = performance.now();
      const got = evaluateShape(runtime, meta.controls[i]!);
      const ms = performance.now() - t;
      let err = 0;
      for (let j = 0; j < n; j++) err = Math.max(err, Math.abs(got[j]! - all[i * n + j]!));
      worst = Math.max(worst, err);
      rows.push(`${name}\t${(err * 1000).toFixed(4)} mm\t${ms.toFixed(0)} ms`);
    });
    console.log(rows.join("\n"));
    expect(worst * 1000).toBeLessThan(0.05);
  });
});
