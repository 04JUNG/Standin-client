import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { validateModel } from "../preview/modelContract";
import { modelRenderingAvailable } from "../preview/modelSupport";
import type { ReviewModel } from "../preview/mountReviewModel";
import { apiFetchBlob } from "@/shared/api/client";
import { useExportStore } from "@/features/export/store/exportStore";
import {
  framedExportUrl,
  rememberFramedFormat,
  type ReviewedIdentity,
} from "@/features/export/lib/framedExport";
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
    const base = scope === "full" && !item.refined ? item.candidate.previewModel : undefined;
    if (enabled && item.exportUrl) {
      try {
        modelKey =
          framedExportUrl(item.exportUrl, scope, "model", character.characterId) +
          `#${item.refined}`;
        model =
          review.data?.capabilities.modelPreview === true &&
          modelRenderingAvailable() &&
          modelStatus[modelKey] !== "failed";
        url = framedExportUrl(
          item.exportUrl,
          scope,
          model ? "model" : "preview",
          character.characterId,
        );
        if (model && base) url += "&useLibraryModel=true";
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
      base,
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
      }): Promise<{ image: string; model?: ReviewModel; identity?: ReviewedIdentity }> => {
        const blob = await apiFetchBlob(request.url, { auth: false, signal });
        if (request.model) {
          if (!blob.type.startsWith("model/gltf-binary"))
            throw new Error("미리보기 형식을 확인하지 못했습니다.");
          const data = await blob.arrayBuffer();
          let meta;
          let base;
          try {
            meta = validateModel(
              data,
              undefined,
              request.characterId,
              request.scope,
              "framed-mesh-v1",
            );
          } catch (error) {
            if (!request.base) throw error;
            meta = validateModel(data, request.base.sourceSha, request.characterId);
            base = request.base;
          }
          if (
            !/^[a-f0-9]{64}$/.test(meta.character_sha256) ||
            !/^[a-f0-9]{64}$/.test(meta.revision)
          )
            throw new Error("model identity");
          return {
            image: "",
            model: { data, characterId: request.characterId, scope: request.scope, base },
            identity: {
              sourceSha: meta.source_bvh_sha256,
              characterSha: meta.character_sha256,
              revision: base ? undefined : meta.revision,
            },
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
  // The server checks the stored refine result before returning a library model.
  const displays = requests.map((r, i) => ({
    model: queries[i]?.data?.model,
    key: r.modelKey + JSON.stringify(queries[i]?.data?.identity),
  }));
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
        rememberFramedFormat(r.exportKey, r.model, queries[i]?.data?.identity);
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
