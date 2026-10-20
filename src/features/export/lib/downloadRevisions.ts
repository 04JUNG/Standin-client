/** Session-local naming history. Files already written are never changed. */
const revisions = new Map<string, string[]>();
export type DownloadSource = { personIndex: number; candidateId: string; downloadPath: string };
export function downloadBinding(format: string, sources: DownloadSource[]) {
  return JSON.stringify([
    format,
    [...sources]
      .sort((a, b) => a.personIndex - b.personIndex)
      .map((s) => {
        const url = new URL(s.downloadPath || "/legacy", "https://standin.invalid");
        return [
          s.personIndex,
          s.candidateId,
          url.searchParams.get("artifactReceipt") ??
            url.searchParams.get("reviewKey") ??
            s.downloadPath,
        ];
      }),
  ]);
}
export function downloadRevision(job: string, binding: string) {
  const saved = revisions.get(job) ?? [];
  const index = saved.indexOf(binding);
  return {
    ordinal: index < 0 ? saved.length + 1 : index + 1,
    repeated: index >= 0,
    changed: saved.length > 0 && index < 0,
  };
}
export function rememberDownload(job: string, binding: string) {
  if (!revisions.has(job)) revisions.set(job, []);
  const saved = revisions.get(job)!;
  if (!saved.includes(binding)) saved.push(binding);
  if (revisions.size > 64) revisions.delete(revisions.keys().next().value!);
}
export function revisionFileName(name: string, ordinal: number) {
  return ordinal <= 1 ? name : name.replace(/(\.[^.]+)$/, `_v${ordinal}$1`);
}
