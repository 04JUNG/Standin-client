import { readAsset } from "./contract";
export type CoverageEntry = {
  sourceSha256: string;
  characterSha256: string;
  revision: string;
  scope: string;
};
/** An inventory report never invokes a renderer/converter or substitutes another scope/body. */
export function auditCoverage(expected: CoverageEntry[], advertised: unknown[]) {
  const entries = advertised
    .map((raw) => {
      const r = raw as Partial<CoverageEntry> | null;
      return readAsset(raw, r?.sourceSha256, r?.scope);
    })
    .filter((v) => v !== undefined);
  const key = (e: CoverageEntry) =>
    JSON.stringify([e.sourceSha256, e.characterSha256, e.revision, e.scope]);
  const actual = new Set(entries.map(key));
  return {
    expected: expected.length,
    covered: expected.filter((e) => actual.has(key(e))).length,
    missing: expected.filter((e) => !actual.has(key(e))).map((e) => ({ ...e })),
    rejected: advertised.length - entries.length,
    // Presence is not byte validation. acquireAsset independently checks SHA/length/source/revision.
    bytesVerified: false as const,
  };
}
