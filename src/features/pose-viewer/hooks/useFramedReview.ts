import { poseRecovery } from "@/shared/api/poseRecovery";
import { useHands } from "@/features/hand-selection/hooks";
import { loadHandReview, type HandReview } from "@/features/hand-selection/api";
import { loadBodyReview } from "@/features/body-selection/review";
import { verifyDigest } from "@/features/body-selection/api";
import { bodyKeys } from "@/features/body-selection/api";
import { useBodyOwner } from "@/features/body-selection/hooks";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { validateModel } from "../preview/modelContract";
import { modelRenderingAvailable } from "../preview/modelSupport";
import type { ReviewModel } from "../preview/mountReviewModel";
import { apiFetchBlob, apiFetchResponse } from "@/shared/api/client";
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
import { previewScope, scopeIncludesHands, SCOPE_LABELS } from "../api/outputScope";
import { blobToDataUrl } from "../api/thumbnails";
import { useSelectionReview } from "./useSelectionReview";

/** Presentation of the actual converter artifact, after refine has finished. */
export function useFramedReview(jobId: string | undefined) {
  const [modelStatus, setModelStatus] = useState<Record<string, "ready" | "failed">>({});
  const review = useSelectionReview(jobId);
  const owner = useBodyOwner();
  const qc = useQueryClient();
  const bodyMode = review.bodies.enabled;
  const format = useExportStore((s) => s.format);
  const hands = useHands(
    review.data,
    review.items.map((i) => i.personIndex),
    format === "fbx",
  );
  const pinned = usePoseSelectionStore((s) => s.characterId);
  const byPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const catalog = useModelCatalog();
  const enabled =
    format === "fbx" &&
    review.data?.capabilities.fbxExport === true &&
    (bodyMode || review.data.capabilities.outputScopeCropping === true);
  const requests = review.items.map((item) => {
    const scope = previewScope(review.data?.people.find((p) => p.index === item.personIndex));
    const character = resolveCharacter({
      pinned: byPerson[item.personIndex] ?? pinned,
      preferred,
      catalog: catalog.data,
      format: "fbx",
      serverSupportsCharacterSelection: review.data?.capabilities.characterSelection === true,
    });
    const body = review.bodies.entries.find((e) => e.personIndex === item.personIndex)?.selection;
    const handEntry = hands.entries.find((e) => e.personIndex === item.personIndex);
    const handSelection = handEntry?.selection;
    let url = "";
    let modelKey = "";
    let model = false;
    let exportKey = "";
    const base = scope === "full" && !item.refined ? item.candidate.previewModel : undefined;
    if (enabled && item.exportUrl) {
      try {
        if (bodyMode) {
          url = framedExportUrl(
            item.exportUrl,
            scope,
            "preview",
            bodyMode ? null : character.characterId,
          );
        } else {
          modelKey =
            framedExportUrl(item.exportUrl, scope, "model", character.characterId) +
            `#${item.refined}`;
          model =
            !handSelection &&
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
            framedExportUrl(item.exportUrl, scope, "fbx", character.characterId) +
            `#${item.refined}`;
        }
      } catch {
        /* Invalid server URL is a visible preview failure, never a render crash. */
      }
    }
    if (url && hands.enabled && handSelection)
      url += `&handSelectionRevision=${handSelection.revision}`;
    return {
      handSelection,
      handEnabled: !!handEntry,
      scope,
      url,
      body,
      modelKey,
      model,
      exportKey,
      base,
      characterId: character.characterId ?? catalog.data?.defaultCharacterId ?? "",
    };
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
            request.handSelection?.revision,
            request.handSelection?.library_sha256,
            review.items[index]?.exportUrl,
            review.items[index]?.refined,
          ]
        : ["framed-preview", owner, request.url, review.items[index]?.refined],
      enabled:
        enabled &&
        (!request.handEnabled || hands.ready) &&
        !review.isRefining &&
        (bodyMode ? request.body?.resolutionStatus === "ready" : catalog.isSuccess) &&
        !!request.url,
      queryFn: async ({
        signal,
      }: {
        signal: AbortSignal;
      }): Promise<{
        image: string;
        model?: ReviewModel;
        identity?: ReviewedIdentity;
        handReceipt?: HandReview;
      }> => {
        if (bodyMode) {
          const item = review.items[index]!;
          const receipt = await loadBodyReview(
            review.data!.jobId,
            item.exportUrl!,
            item.personIndex,
            item.candidate.id,
            request.scope,
            request.body!,
            signal,
            hands.enabled ? request.handSelection : undefined,
          );
          return { ...receipt, image: receipt.previewUrl };
        }
        if (hands.enabled && request.handSelection) {
          const item = review.items[index]!;
          return loadHandReview(
            request.url,
            framedExportUrl(item.exportUrl!, request.scope, "fbx", request.characterId),
            request.handSelection,
            signal,
          );
        }
        const manual = review.items[index]!.candidate.manualExportAllowed === true;
        const response = manual
          ? await apiFetchResponse(request.url, { auth: false, signal })
          : undefined;
        const receipt = response
          ? {
              reviewKey: response.headers.get("X-Standin-Review-Key") ?? "",
              artifactSha256: response.headers.get("X-Standin-Artifact-SHA256") ?? "",
              characterSha: response.headers.get("X-Standin-Character-SHA256") ?? "",
              sourceSha: response.headers.get("X-Standin-Source-BVH-SHA256") ?? "",
              previewSha: response.headers.get("X-Standin-Preview-Artifact-SHA256") ?? "",
            }
          : undefined;
        if (receipt && Object.values(receipt).some((v) => !/^[a-f0-9]{64}$/.test(v)))
          throw new Error("저장할 포즈의 확인 정보를 받지 못했습니다.");
        if (receipt && receipt.sourceSha !== review.items[index]!.candidate.sourceBvhSha256)
          throw new Error("선택한 포즈와 미리보기의 원본이 다릅니다.");
        const blob = response
          ? await response.blob()
          : await apiFetchBlob(request.url, { auth: false, signal });
        if (receipt) await verifyDigest(await blob.arrayBuffer(), receipt.previewSha);
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
            receipt &&
            (meta.source_bvh_sha256 !== receipt.sourceSha ||
              meta.character_sha256 !== receipt.characterSha)
          )
            throw new Error("선택한 포즈와 체형을 확인하지 못했습니다.");
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
              ...(receipt
                ? { reviewKey: receipt.reviewKey, artifactSha256: receipt.artifactSha256 }
                : {}),
            },
          };
        }
        if (!blob.type.startsWith("image/png"))
          throw new Error("미리보기 형식을 확인하지 못했습니다.");
        return {
          image: await blobToDataUrl(blob),
          ...(receipt
            ? {
                identity: {
                  sourceSha: review.items[index]!.candidate.sourceBvhSha256!,
                  characterSha: receipt.characterSha,
                  reviewKey: receipt.reviewKey,
                  artifactSha256: receipt.artifactSha256,
                },
              }
            : {}),
        };
      },
      retry: false,
      staleTime: bodyMode ? 0 : 300_000,
      gcTime: 600_000,
    })),
  });
  // The server checks the stored refine result before returning a library model.
  const displays = requests.map((r, i) => ({
    model: queries[i]?.data?.model,
    key: r.modelKey + JSON.stringify(queries[i]?.data?.identity),
  }));
  const handLoading = hands.enabled && !hands.error && !hands.ready;
  const previewLoading =
    enabled &&
    (handLoading ||
      review.isRefining ||
      (bodyMode
        ? review.bodies.entries.some((e) => !e.selection && !e.error)
        : catalog.isPending) ||
      ((bodyMode
        ? requests.every((r) => r.body?.resolutionStatus === "ready")
        : catalog.isSuccess) &&
        requests.every((r) => !!r.url) &&
        !hands.error &&
        queries.some((q, i) =>
          displays[i]?.model
            ? modelStatus[displays[i]!.key] !== "ready"
            : q.isFetching || q.isPending,
        )));
  const previewError =
    enabled &&
    !previewLoading &&
    (hands.error ||
      (bodyMode
        ? review.bodies.entries.some((e) => e.error || e.selection?.resolutionStatus !== "ready")
        : catalog.isError) ||
      requests.some((r) => !r.url) ||
      queries.some((q) => q.isError));
  useEffect(() => {
    if (bodyMode || !enabled || review.isRefining) return;
    requests.forEach((r, i) => {
      if (
        r.exportKey &&
        (queries[i]?.data?.image ||
          (displays[i]?.model && modelStatus[displays[i]!.key] === "ready"))
      )
        rememberFramedFormat(r.exportKey, r.model, queries[i]?.data?.identity);
    });
  }, [bodyMode, enabled, review.isRefining, requests, queries, displays, modelStatus]);
  return {
    ...review,
    hands,
    items: review.items.map((item, index) => ({
      ...item,
      includesHands: scopeIncludesHands(requests[index]!.scope),
      previewUrl: enabled ? (queries[index]?.data?.image ?? "") : item.previewUrl,
      previewModel: enabled ? displays[index]?.model : undefined,
      previewReference: !enabled && item.previewReference,
      onModelStatus: (status: "ready" | "failed") =>
        setModelStatus((current) => {
          const key = status === "failed" ? requests[index]!.modelKey : displays[index]!.key;
          return current[key] === status ? current : { ...current, [key]: status };
        }),
      scopeLabel: enabled ? SCOPE_LABELS[requests[index]!.scope] : "",
    })),
    previewLoading,
    previewError,
    previewFailure: poseRecovery(
      queries.find((q) => q.isError)?.error ??
        review.bodies.entries.find((e) => e.error)?.error ??
        hands.entries.find((e) => e.error)?.error ??
        catalog.error,
    ),
    /** 수치를 조절한 체형이 있으면 서버가 원본 모델로 굽는다(1~2분). 기다리는 이유를 알린다. */
    shapedBake: bodyMode && review.bodies.entries.some((e) => !!e.selection?.shape),
    previewNotice: enabled
      ? `고른 체형${hands.enabled ? "과 손 모양" : ""}으로 저장할 모습이에요. FBX에는 움직임을 위한 전신 뼈대가 함께 들어가요.`
      : format === "bvh"
        ? `BVH에는 전체 동작만 저장돼요. 고른 체형${requests.some((r) => scopeIncludesHands(r.scope)) ? "·손 모양" : ""}과 잘라낼 범위는 FBX에만 적용돼요.`
        : "",
    retryPreview: async () => {
      if (hands.enabled) await Promise.all(hands.entries.map((e) => e.retry()));
      if (bodyMode) {
        await Promise.all(review.bodies.entries.map((entry) => entry.retry()));
        await qc.invalidateQueries({
          queryKey: ["body", owner, review.data!.jobId],
          predicate: (q) => q.queryKey[4] === "review",
        });
      } else {
        await catalog.refetch();
        await Promise.all(queries.map((query) => query.refetch()));
      }
    },
  };
}
