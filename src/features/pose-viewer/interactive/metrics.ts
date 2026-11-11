// Local diagnostics only. No source, names, paths, query, owner or model identifiers.
export type Metric =
  | "download"
  | "parse"
  | "first-frame"
  | "frame"
  | "hand-frame"
  | "packet"
  | "file-ready"
  | "context-loss"
  | "error";
const samples: { metric: Metric; ms: number; cache?: "cold" | "warm" }[] = [];
export function measure(metric: Metric, start: number, cache?: "cold" | "warm") {
  samples.push({ metric, ms: performance.now() - start, ...(cache ? { cache } : {}) });
  if (samples.length > 1000) samples.shift();
}
export function measurements() {
  return samples.map((s) => ({ ...s }));
}
