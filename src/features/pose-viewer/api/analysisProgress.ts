import { z } from "zod";

export const ANALYSIS_STAGES = [
  "analyzing",
  "extracting",
  "understanding",
  "searching",
  "refining",
  "ranking",
] as const;
const stage = z.enum(ANALYSIS_STAGES);
const point = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
export const overlaySchema = z.object({
  format: z.literal("coco17"),
  coordinateSpace: z.literal("image-normalized"),
  points: z.array(point.nullable()).length(17),
});
// Relative API images use the installation-aware fetcher. External images never get credentials.
const imageUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    if (/[\\\s]/.test(value)) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  });
const id = z.string().trim().min(1).max(160);
const candidate = z.object({ id, rank: z.number().int().min(1).max(100), thumbnailUrl: imageUrl });
// A cut-level observation, separate from the representative person's body tags.
// Bad optional metadata must not discard an otherwise useful progress snapshot.
const scene = z.object({
  shot: z.enum(["full_half", "bust", "face"]).optional().catch(undefined),
  view: z.enum(["front", "side", "back", "three_quarter"]).optional().catch(undefined),
  personCount: z.number().int().min(0).max(20).optional().catch(undefined),
});
const person = z.object({
  personIndex: z.number().int().min(0).max(99),
  skeleton: overlaySchema.optional(),
  observations: z
    .array(z.object({ id, label: z.string().trim().min(1).max(40) }))
    .max(8)
    .optional(),
  searchMode: z.enum(["pose", "description", "combined", "upper_body"]).optional(),
  candidates: z.array(candidate).max(5).optional(),
  refinement: z
    .object({
      candidateId: id,
      status: z.enum(["running", "improved", "unchanged", "reverted", "skipped"]),
      /** Only the joints the actual refinement operation names. Never inferred from eligibility. */
      activeJoints: z
        .array(z.number().int().min(5).max(16))
        .max(12)
        .refine((joints) => new Set(joints).size === joints.length)
        .optional(),
      before: overlaySchema.optional(),
      after: overlaySchema.optional(),
      beforeThumbnailUrl: imageUrl.optional(),
      afterThumbnailUrl: imageUrl.optional(),
    })
    .optional(),
});
const schema = z
  .object({
    version: z.literal("pose-analysis-progress.v1"),
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    stage,
    updatedAt: z.string().datetime({ offset: true }),
    completedStages: z.array(stage).max(6),
    skippedStages: z.array(stage).max(6),
    activePersonIndex: z.number().int().min(0).max(99).optional(),
    scene: scene.optional().catch(undefined),
    /** Temporary observed body, before final multi-person order is known. No selectable index. */
    focus: z
      .object({
        id,
        skeleton: overlaySchema,
        observations: person.shape.observations,
        searchMode: person.shape.searchMode,
      })
      .optional(),
    people: z.array(person).max(20),
  })
  .superRefine((value, ctx) => {
    const duplicate = (values: (string | number)[]) => new Set(values).size !== values.length;
    if (
      duplicate(value.people.map((p) => p.personIndex)) ||
      duplicate((value.focus?.observations ?? []).map((o) => o.id)) ||
      duplicate(value.completedStages) ||
      duplicate(value.skippedStages) ||
      value.completedStages.some((s) => value.skippedStages.includes(s)) ||
      value.people.some(
        (p) =>
          duplicate((p.observations ?? []).map((o) => o.id)) ||
          duplicate((p.candidates ?? []).map((c) => c.id)),
      )
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conflicting progress snapshot" });
    }
  });
export type AnalysisSnapshot = z.infer<typeof schema>;
export type AnalysisPersonProgress = AnalysisSnapshot["people"][number];
export type SkeletonOverlay = z.infer<typeof overlaySchema>;
export type ProgressCandidate = z.infer<typeof candidate>;

/** Progress is optional decoration: an invalid extension must never fail a search. */
export function readAnalysisProgress(raw: unknown): AnalysisSnapshot | undefined {
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function activeProgressPerson(
  snapshot?: AnalysisSnapshot,
  evidence?: "skeleton" | "observations" | "candidates" | "refinement",
): AnalysisPersonProgress | undefined {
  if (!snapshot) return undefined;
  const active =
    snapshot.activePersonIndex === undefined
      ? snapshot.people[0]
      : snapshot.people.find((p) => p.personIndex === snapshot.activePersonIndex);
  if (!evidence) return active;
  const available = (person: AnalysisPersonProgress) =>
    evidence === "skeleton"
      ? (person.skeleton?.points.slice(5).filter(Boolean).length ?? 0) >= 2
      : evidence === "refinement"
        ? !!person.refinement
        : !!person[evidence]?.length;
  return active && available(active) ? active : (snapshot.people.find(available) ?? active);
}
