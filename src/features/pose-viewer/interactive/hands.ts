import { interactiveController } from "./session";
import { type LoadedVariants } from "./solved";
/** The controller owns bounded compiled surfaces and releases them on expiry,
 * deletion, owner/body/refine change and session eviction. */
export function registerHandAtlas(
  owner: string,
  job: string,
  person: number,
  atlas: LoadedVariants,
) {
  const controller = interactiveController(owner, job, person);
  controller.installHandAtlas(atlas);
}
export function applyLocalHands(
  owner: string,
  job: string,
  person: number,
  left: string | null,
  right: string | null,
) {
  return interactiveController(owner, job, person).applyHands(left, right);
}
