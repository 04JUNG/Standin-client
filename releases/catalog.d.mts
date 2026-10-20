export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  features: string[];
  improvements: string[];
  fixes: string[];
}
export function compareVersions(a: string, b: string): number;
export function validateCatalog(value: unknown): ReleaseNote[];
export function releasesBetween(
  catalog: ReleaseNote[],
  previous: string | null,
  current: string,
): ReleaseNote[];
export function formatNotes(entry: ReleaseNote): string;
