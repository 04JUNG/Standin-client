/** Semantic steps only: never follow browser history into another job or the app.
 * Progress creates a job on mount, so it must never be a back destination.
 * Navigation deliberately leaves drafts, choices, review caches and saved files intact.
 */
export function previousBarRoute(
  pathname: string,
  { jobId, saving }: { jobId: string | null; saving: boolean },
): string | null {
  if (pathname === "/bar/search" || pathname === "/bar/candidates") return "/bar/actions";
  if (pathname === "/bar/review" && jobId) return "/bar/candidates";
  // Keep an in-flight native save mounted; its completion owns the saved result.
  if (pathname === "/bar/save" && jobId && !saving) return "/bar/review";
  // Entry, transient progress, and unknown routes have no safe previous step.
  return null;
}
