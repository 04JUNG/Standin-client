import { interactiveController } from "./session";
import { localHandSurface, solvedCamera, type LoadedVariants } from "./solved";
import { measure } from "./metrics";
const atlases = new Map<string, LoadedVariants>();
const key = (owner: string, job: string, person: number) => JSON.stringify([owner, job, person]);
/** Called only with a hash-checked, owner-authorized, exact server variant table. No automatic personal model capability. */
export function registerHandAtlas(
  owner: string,
  job: string,
  person: number,
  atlas: LoadedVariants,
) {
  const k = key(owner, job, person);
  atlases.get(k)?.release();
  atlases.set(k, atlas);
  return () => {
    if (atlases.get(k) === atlas) {
      atlases.delete(k);
      atlas.release();
    }
  };
}
export function clearHandAtlases() {
  for (const atlas of atlases.values()) atlas.release();
  atlases.clear();
}
export function applyLocalHands(
  owner: string,
  job: string,
  person: number,
  left: string | null,
  right: string | null,
) {
  const started = performance.now();
  const atlas = atlases.get(key(owner, job, person));
  if (!atlas) return false;
  const controller = interactiveController(owner, job, person),
    model = controller.snapshot().model;
  if (!model?.frame) return false;
  try {
    const surface = localHandSurface(atlas, model.state.identity, left, right);
    if (!surface) return false; // Keep the previous authoritative doll; wait for the server.
    controller.localDraft({ body: surface.body, camera: solvedCamera(model.state, model.frame) });
    requestAnimationFrame(() => measure("hand-frame", started));
    return true;
  } catch {
    return false;
  }
}
