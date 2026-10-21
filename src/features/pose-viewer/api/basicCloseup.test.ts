import { beforeEach, expect, it, vi } from "vitest";
import { isBasicCloseup, loadBasicCloseup } from "./basicCloseup";
import type { PosePresentation } from "./posePresentation";
import { humanFixture } from "@/test/humanReferenceFixture";
const calls = vi.hoisted(() => ({ template: vi.fn(), render: vi.fn() }));
vi.mock("./humanReference", () => ({ loadHumanTemplate: calls.template }));
vi.mock("../preview/basicCloseup", () => ({ renderBasicCloseup: calls.render }));
export function closeup(): PosePresentation {
  return {
    version: "dynamic-pose-presentation-v1",
    person_index: 0,
    route: "basic_model",
    status: "basic_reference",
    search_status: "ok",
    search_reason: "explicit_closeup_basic_model",
    generation_status: "not_requested",
    generation_reason: "basic_model_not_pose_generation",
    output_scope: "shoulder_head",
    unobserved_body_is_default: true,
    library_candidates: [],
    review_candidates: [],
    generated_candidates: [],
    basic_model: {
      status: "planned",
      output_scope: "shoulder_head",
      preview: {
        version: "basic-closeup-preview-v1",
        scope: "shoulder_head",
        pose: "neutral",
        preview_only: true,
        template_url: "/v1/pose-candidates/default-body-template/shoulder_head",
      },
    },
    issues: [],
    preview_status: "not_requested",
    auto_apply_allowed: false,
    refine_allowed: false,
    export_allowed: false,
  };
}
beforeEach(() => {
  calls.template.mockReset().mockResolvedValue({ ...humanFixture(), scope: "shoulder_head" });
  calls.render.mockReset().mockResolvedValue("data:image/png;base64,AA==");
});
it.each(["head", "shoulder_head"] as const)(
  "loads the verified %s template and renders neutral geometry",
  async (scope) => {
    const p = closeup();
    p.output_scope = p.basic_model!.output_scope = scope;
    p.basic_model!.preview!.scope = scope;
    p.basic_model!.preview!.template_url = `/v1/pose-candidates/default-body-template/${scope}`;
    const signal = new AbortController().signal;
    expect(isBasicCloseup(p)).toBe(true);
    expect(await loadBasicCloseup(p, signal)).toMatch(/^data:image\/png/);
    expect(calls.template).toHaveBeenCalledWith(scope, signal);
    expect(calls.render).toHaveBeenCalledTimes(1);
    expect(p.library_candidates).toEqual([]);
    expect(p.export_allowed).toBe(false);
  },
);
it.each(["url", "scope", "version", "policy", "search", "old-bff"])(
  "rejects %s without loading another asset",
  async (change) => {
    const p = closeup();
    if (change === "url") p.basic_model!.preview!.template_url = "https://external.invalid/mesh";
    if (change === "scope") p.output_scope = "half";
    if (change === "version") p.basic_model!.preview!.version = "future" as never;
    if (change === "policy") p.basic_model!.preview!.preview_only = false as never;
    if (change === "search") p.search_status = "error";
    if (change === "old-bff") delete p.basic_model!.preview;
    await expect(loadBasicCloseup(p, new AbortController().signal)).rejects.toThrow();
    expect(calls.template).not.toHaveBeenCalled();
    expect(calls.render).not.toHaveBeenCalled();
  },
);
it("does not render or fall back after template failure or cancellation", async () => {
  calls.template.mockRejectedValueOnce(Error("asset missing"));
  await expect(loadBasicCloseup(closeup(), new AbortController().signal)).rejects.toThrow(
    "asset missing",
  );
  expect(calls.render).not.toHaveBeenCalled();
  const controller = new AbortController();
  calls.template.mockImplementationOnce(async () => {
    controller.abort();
    return humanFixture();
  });
  await expect(loadBasicCloseup(closeup(), controller.signal)).rejects.toThrow();
  expect(calls.render).not.toHaveBeenCalled();
});
