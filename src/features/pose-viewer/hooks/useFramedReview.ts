import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { validateModel } from "../preview/modelContract";
import type { ReviewModel } from "../preview/mountReviewModel";
import { apiFetchBlob } from "@/shared/api/client";
import { useExportStore } from "@/features/export/store/exportStore";
import { framedExportUrl, rememberFramedFormat } from "@/features/export/lib/framedExport";
import { useModelStore } from "@/features/models/store/modelStore";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { resolveCharacter } from "@/features/models/lib/resolveCharacter";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { readOutputScope, SCOPE_LABELS } from "../api/outputScope";
import { blobToDataUrl } from "../api/thumbnails";
import { useSelectionReview } from "./useSelectionReview";

/** Presentation of the actual converter artifact, after refine has finished. */
export function useFramedReview(jobId: string | undefined) {
  const [modelStatus, setModelStatus] = useState<Record<string, "ready" | "failed">>({});
  const review = useSelectionReview(jobId);
  const format = useExportStore((s) => s.format);
  const pinned = usePoseSelectionStore((s) => s.characterId);
  const byPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const catalog = useModelCatalog();
  const enabled =
    format === "fbx" &&
    review.data?.capabilities.fbxExport === true &&
    review.data.capabilities.outputScopeCropping === true;
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
    let url = "";
    let modelKey = "";
    let model = false;
    let exportKey = "";
    if (enabled && item.exportUrl) {
      try {
        modelKey =
          framedExportUrl(item.exportUrl, scope, "model", character.characterId) +
          `#${item.refined}`;
        model =
          review.data?.capabilities.modelPreview === true && modelStatus[modelKey] !== "failed";
        url = framedExportUrl(
          item.exportUrl,
          scope,
          model ? "model" : "preview",
          character.characterId,
        );
        exportKey =
          framedExportUrl(item.exportUrl, scope, "fbx", character.characterId) + `#${item.refined}`;
      } catch {
        /* Invalid server URL is a visible preview failure, never a render crash. */
      }
    }
    return {
      scope,
      url,
      modelKey,
      model,
      exportKey,
      characterId: character.characterId ?? catalog.data?.defaultCharacterId ?? "",
    };
  });
  const queries = useQueries({
    queries: requests.map((request, index) => ({
      queryKey: ["framed-preview", request.url, review.items[index]?.refined],
      enabled: enabled && !review.isRefining && catalog.isSuccess && !!request.url,
      queryFn: async ({
        signal,
      }: {
        signal: AbortSignal;
      }): Promise<{ image: string; model?: ReviewModel }> => {
        const blob = await apiFetchBlob(request.url, { auth: false, signal });
        if (request.model) {
          if (!blob.type.startsWith("model/gltf-binary"))
            throw new Error("미리보기 형식을 확인하지 못했습니다.");
          const data = await blob.arrayBuffer();
          validateModel(data, undefined, request.characterId, request.scope, "framed-mesh-v1");
          return {
            image: "",
            model: { data, characterId: request.characterId, scope: request.scope },
          };
        }
        if (!blob.type.startsWith("image/png"))
          throw new Error("미리보기 형식을 확인하지 못했습니다.");
        return { image: await blobToDataUrl(blob) };
      },
      retry: false,
      staleTime: 300_000,
      gcTime: 600_000,
    })),
  });
  // Only an unmodified, full-body result can reuse a library surface. Preparation
  // still runs once in parallel so the export can join the same pending FBX job.
  const baseQueries = useQueries({
    queries: requests.map((request, index) => {
      const item = review.items[index]!;
      const base = item.candidate.previewModel;
      return {
        queryKey: ["review-base-model", base, request.characterId],
        enabled:
          enabled &&
          request.model &&
          request.scope === "full" &&
          !item.refined &&
          !review.isRefining &&
          catalog.isSuccess &&
          !!base,
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ReviewModel> => {
          const url = `${base!.url}${base!.url.includes("?") ? "&" : "?"}characterId=${encodeURIComponent(request.characterId)}`;
          const blob = await apiFetchBlob(url, { auth: false, signal });
          if (blob.type !== "model/gltf-binary") throw new Error("model unavailable");
          const data = await blob.arrayBuffer();
          validateModel(data, base!.sourceSha, request.characterId);
          return { data, characterId: request.characterId, scope: "full", base };
        },
        retry: false,
        staleTime: 300_000,
        gcTime: 600_000,
      };
    }),
  });
  const displays = requests.map((r, i) => {
    const base =
      r.model && r.scope === "full" && !review.items[i]!.refined && !review.isRefining
        ? baseQueries[i]?.data
        : undefined;
    return {
      model: base ?? queries[i]?.data?.model,
      key: r.modelKey + (base ? ":base" : ":final"),
    };
  });
  const previewLoading =
    enabled &&
    (review.isRefining ||
      catalog.isPending ||
      (catalog.isSuccess &&
        requests.every((r) => !!r.url) &&
        queries.some((q, i) =>
          displays[i]?.model
            ? modelStatus[displays[i]!.key] !== "ready"
            : q.isFetching || q.isPending,
        )));
  const previewError =
    enabled &&
    !previewLoading &&
    (catalog.isError || requests.some((r) => !r.url) || queries.some((q) => q.isError));
  useEffect(() => {
    if (!enabled || review.isRefining) return;
    requests.forEach((r, i) => {
      if (
        r.exportKey &&
        (queries[i]?.data?.image ||
          (displays[i]?.model && modelStatus[displays[i]!.key] === "ready"))
      )
        rememberFramedFormat(r.exportKey, r.model);
    });
  }, [enabled, review.isRefining, requests, queries, displays, modelStatus]);
  return {
    ...review,
    items: review.items.map((item, index) => ({
      ...item,
      previewUrl: enabled ? (queries[index]?.data?.image ?? "") : item.previewUrl,
      previewModel: enabled ? displays[index]?.model : undefined,
      onModelStatus: (status: "ready" | "failed") =>
        setModelStatus((current) => {
          const key = status === "failed" ? requests[index]!.modelKey : displays[index]!.key;
          return current[key] === status ? current : { ...current, [key]: status };
        }),
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
