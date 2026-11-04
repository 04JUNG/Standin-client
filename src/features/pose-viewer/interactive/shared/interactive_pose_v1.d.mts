export function readSolvedState(bytes: Uint8Array, expectedSha256: string): Promise<unknown>;
export function readHandVariants(bytes: Uint8Array, expectedSha256: string): Promise<unknown>;
export function selectHandVariant(
  table: unknown,
  currentIdentity: unknown,
  hands: { left: string | null; right: string | null },
): unknown;
