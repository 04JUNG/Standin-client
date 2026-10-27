/** In-memory text only. Restoring a draft never submits another search. */
type DraftInput = { seed: string; query: string };
type Draft = DraftInput & { version: number };
let nextVersion = 0;
const drafts = new Map<string, Draft>();
const key = (owner: string | undefined, context: string) => JSON.stringify([owner, context]);
export function readSearchDraft(owner: string | undefined, context: string, seed: string) {
  const draft = drafts.get(key(owner, context));
  return draft?.seed === seed ? draft : undefined;
}
export function saveSearchDraft(owner: string | undefined, context: string, draft: DraftInput) {
  const id = key(owner, context);
  drafts.delete(id);
  const version = ++nextVersion;
  drafts.set(id, { ...draft, version });
  if (drafts.size > 12) drafts.delete(drafts.keys().next().value!);
  return version;
}
export function isCurrentSearchDraft(
  owner: string | undefined,
  context: string,
  seed: string,
  version: number,
) {
  const draft = readSearchDraft(owner, context, seed);
  return draft?.version === version;
}
export function clearSearchDrafts() {
  drafts.clear();
}
export function initialSearchQuery(state: unknown): string {
  return state && typeof state === "object" && "query" in state && typeof state.query === "string"
    ? state.query.slice(0, 500)
    : "";
}
