import type { PosePresentation } from "./posePresentation";

/** A basic reference is not a library/generated pose or a selectable candidate. */
export function isBasicCloseup(p: PosePresentation): boolean {
  return (
    p.version === "dynamic-pose-presentation-v1" &&
    p.route === "basic_model" &&
    p.status === "basic_reference" &&
    p.search_status === "ok" &&
    p.basic_model?.status === "planned" &&
    p.issues.length === 0 &&
    p.auto_apply_allowed === false &&
    p.refine_allowed === false &&
    p.export_allowed === false &&
    [p.library_candidates, p.review_candidates, p.generated_candidates].every((g) => g.length === 0)
  );
}

export async function loadBasicCloseup(p: PosePresentation, signal: AbortSignal): Promise<string> {
  const plan = p.basic_model?.preview;
  if (
    !isBasicCloseup(p) ||
    !plan ||
    plan.version !== "basic-closeup-preview-v1" ||
    plan.pose !== "neutral" ||
    plan.preview_only !== true ||
    !["head", "shoulder_head"].includes(plan.scope) ||
    plan.scope !== p.output_scope ||
    plan.scope !== p.basic_model?.output_scope ||
    plan.template_url !== `/v1/pose-candidates/default-body-template/${plan.scope}`
  )
    throw Error("기본 클로즈업 미리보기 정보를 확인하지 못했습니다.");
  signal.throwIfAborted();
  // Fixed authenticated template endpoint, verified scope/body/digests. Never fetch
  // an arbitrary plan URL, source BVH, or candidate-triggered Converter request.
  const { loadHumanTemplate } = await import("./humanReference");
  const template = await loadHumanTemplate(plan.scope, signal);
  signal.throwIfAborted();
  const { renderBasicCloseup } = await import("../preview/basicCloseup");
  return renderBasicCloseup(template, signal);
}
