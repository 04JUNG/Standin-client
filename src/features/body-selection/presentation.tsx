/** Preview-only poses share the persisted body/shape choice; they never enter export state. */
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchResponse } from "@/shared/api/client";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import type {
  PosePresentation,
  PreviewCandidate,
} from "@/features/pose-viewer/api/posePresentation";
import { bodyKeys, getSelection, personPath, verifyDigest } from "./api";
import { useBodyOwner, type BodyEntry } from "./hooks";
import type { BodySelection } from "./contract";

export async function renderPresentationBody(
  job: string,
  candidate: PreviewCandidate,
  selection: BodySelection,
  signal: AbortSignal,
) {
  const prefix = personPath(job, selection.personIndex) + "/pose-previews/";
  const url = prefix + candidate.candidate_id + "/" + candidate.asset.bvh_sha256;
  if (candidate.asset.preview_bvh_url !== url || !selection.previewOnly || !selection.resolvedBody)
    throw Error("포즈와 체형을 확인하지 못했습니다.");
  const response = await apiFetchResponse(url + "/body/" + selection.selectionRevision, {
    auth: false,
    signal,
  });
  const expected = {
    "Body-Revision": String(selection.selectionRevision),
    "Character-SHA256": selection.resolvedBody.assetSha256,
    "Shape-SHA256": selection.shape?.shapeSha256 ?? "none",
    "Source-BVH-SHA256": candidate.asset.bvh_sha256,
    "Preview-Projection": "orthographic",
    "Preview-Only": "true",
  };
  for (const [key, value] of Object.entries(expected))
    if (response.headers.get("X-Standin-" + key) !== value)
      throw Error("포즈와 체형의 버전이 다릅니다.");
  const bytes = await response.arrayBuffer();
  if (
    response.headers.get("Content-Type") !== "image/png" ||
    bytes.byteLength > 8 * 1024 * 1024 ||
    bytes.byteLength < 8
  )
    throw Error("체형 미리보기 형식을 확인하지 못했습니다.");
  const blob = new Blob([bytes], { type: "image/png" });
  const magic = new Uint8Array(bytes).slice(0, 8);
  if (!magic.every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i]))
    throw Error("체형 미리보기 형식을 확인하지 못했습니다.");
  await verifyDigest(bytes, response.headers.get("X-Standin-Artifact-SHA256") ?? "");
  signal.throwIfAborted();
  return blobToDataUrl(blob);
}
export function usePresentationBody(job: string, presentation: PosePresentation) {
  const owner = useBodyOwner(),
    index = presentation.person_index;
  const qc = useQueryClient();
  const selection = useQuery({
    queryKey: bodyKeys.selection(owner, job, index),
    queryFn: ({ signal }) => getSelection(job, index, signal),
    enabled: !!owner,
    retry: false,
    staleTime: 0,
  });
  const pending = useIsMutating({ mutationKey: ["body-change", owner, job, index] }) > 0;
  const candidates = [
    ...presentation.library_candidates,
    ...presentation.review_candidates,
    ...presentation.generated_candidates,
  ];
  const pictures = useQuery({
    queryKey: [
      ...bodyKeys.person(owner, job, index),
      "images",
      "presentation",
      selection.data,
      presentation,
    ],
    enabled:
      !!owner &&
      !pending &&
      !selection.isFetching &&
      selection.data?.resolutionStatus === "ready" &&
      selection.data.previewOnly === true,
    queryFn: async ({ signal }) => {
      const images: Record<string, string> = {};
      // Converter has one render slot: serialize the group and commit only a consistent body.
      for (const candidate of candidates) {
        signal.throwIfAborted();
        images[candidate.candidate_id] = await renderPresentationBody(
          job,
          candidate,
          selection.data!,
          signal,
        );
      }
      return images;
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
  const ready =
    !pending &&
    !selection.isFetching &&
    selection.isSuccess &&
    pictures.isSuccess &&
    !pictures.isFetching;
  const entry: BodyEntry = {
    personIndex: index,
    selection: selection.data,
    group: undefined,
    ready,
    error:
      selection.error ??
      pictures.error ??
      (selection.data && selection.data.resolutionStatus !== "ready"
        ? Error("사용할 체형을 선택해 주세요.")
        : null),
    retry: async () => {
      await selection.refetch();
      await qc.invalidateQueries({ queryKey: [...bodyKeys.person(owner, job, index), "images"] });
    },
  };
  return { entry, images: ready ? pictures.data : undefined };
}
