import { loadBodyReview } from "@/features/body-selection/review";
import { bodyKeys } from "@/features/body-selection/api";
import { useBodyOwner } from "@/features/body-selection/hooks";
import { useQueries } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import { useExportStore } from "@/features/export/store/exportStore";
import { framedExportUrl } from "@/features/export/lib/framedExport";
import { useModelStore } from "@/features/models/store/modelStore";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { resolveCharacter } from "@/features/models/lib/resolveCharacter";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { readOutputScope, SCOPE_LABELS } from "../api/outputScope";
import { blobToDataUrl } from "../api/thumbnails";
import { useSelectionReview } from "./useSelectionReview";

/** Presentation of the actual converter artifact, after refine has finished. */
export function useFramedReview(jobId: string | undefined) {
  const review = useSelectionReview(jobId);
  const owner = useBodyOwner();
  const bodyMode = review.bodies.enabled;
  const format = useExportStore((s) => s.format);
  const pinned = usePoseSelectionStore((s) => s.characterId);
  const byPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const catalog = useModelCatalog();
  const enabled =
    format === "fbx" &&
    review.data?.capabilities.fbxExport === true &&
    (bodyMode || review.data.capabilities.outputScopeCropping === true);
  const requests = review.items.map((item) => {
    const scope = readOutputScope(
      review.data?.people.find((p) => p.index === item.personIndex)?.outputScope,
    ).resolved;
    const character = resolveCharacter({
      pinned: byPerson[item.personIndex] ?? pinned,
      preferred,
      catalog: catalog.data,
      format: "fbx",
      serverSupportsCharacterSelection: review.data?.capabilities.characterSelection === true,
    });
    const body = review.bodies.entries.find((e) => e.personIndex === item.personIndex)?.selection;
    let url = "";
    if (enabled && item.exportUrl) {
      try {
        url = framedExportUrl(
          item.exportUrl,
          scope,
          "preview",
          bodyMode ? null : character.characterId,
        );
      } catch {
        /* Invalid server URL is a visible preview failure, never a render crash. */
      }
    }
    return { scope, url, body };
  });
  const queries = useQueries({
    queries: requests.map((request, index) => ({
      queryKey: bodyMode
        ? [
            ...bodyKeys.person(owner, review.data!.jobId, review.items[index]!.personIndex),
            "review",
            review.items[index]!.candidate.id,
            request.scope,
            request.body?.selectionRevision,
            review.items[index]?.exportUrl,
            review.items[index]?.refined,
          ]
        : ["framed-preview", request.url, review.items[index]?.refined],
      enabled:
        enabled &&
        !review.isRefining &&
        (bodyMode ? request.body?.resolutionStatus === "ready" : catalog.isSuccess) &&
        !!request.url,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (bodyMode) {
          const item = review.items[index]!;
          return loadBodyReview(
            review.data!.jobId,
            item.exportUrl!,
            item.personIndex,
            item.candidate.id,
            request.scope,
            request.body!,
            signal,
          );
        }
        const blob = await apiFetchBlob(request.url, { auth: false, signal });
        if (!blob.type.startsWith("image/png"))
          throw new Error("미리보기 형식을 확인하지 못했습니다.");
        return { previewUrl: await blobToDataUrl(blob) };
      },
      retry: false,
      staleTime: 0,
      gcTime: 600_000,
    })),
  });
  const previewLoading =
    enabled &&
    (review.isRefining ||
      (bodyMode
        ? review.bodies.entries.some((e) => !e.selection && !e.error)
        : catalog.isPending) ||
      ((bodyMode
        ? requests.every((r) => r.body?.resolutionStatus === "ready")
        : catalog.isSuccess) &&
        requests.every((r) => !!r.url) &&
        queries.some((q) => q.isFetching || q.isPending)));
  const previewError =
    enabled &&
    !previewLoading &&
    ((bodyMode
      ? review.bodies.entries.some((e) => e.error || e.selection?.resolutionStatus !== "ready")
      : catalog.isError) ||
      requests.some((r) => !r.url) ||
      queries.some((q) => q.isError));
  return {
    ...review,
    items: review.items.map((item, index) => ({
      ...item,
      previewUrl: enabled ? (queries[index]?.data?.previewUrl ?? "") : item.previewUrl,
      scopeLabel: enabled ? SCOPE_LABELS[requests[index]!.scope] : "",
    })),
    previewLoading,
    previewError,
    previewNotice: enabled
      ? "선택한 범위와 체형으로 저장될 FBX입니다. 뼈대는 전신 구조를 유지합니다."
      : format === "bvh"
        ? "BVH는 전신 뼈대의 동작 파일입니다. 출력 범위는 FBX에 적용됩니다."
        : "",
    retryPreview: () => {
      void catalog.refetch();
      for (const query of queries) void query.refetch();
    },
  };
}
