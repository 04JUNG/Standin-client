import { useReviewJourney } from "@/features/analytics/useReviewJourney";
import { requestExport } from "@/features/analytics/journeyAttempts";
import { downloadBinding, downloadRevision } from "@/features/export/lib/downloadRevisions";
import { ApiError } from "@/shared/api/errors";
import { poseRecovery } from "@/shared/api/poseRecovery";
import { useHands } from "@/features/hand-selection/hooks";
import { loadHandReview, type HandReview } from "@/features/hand-selection/api";
import { loadBodyReview, type BodyReview } from "@/features/body-selection/review";
import { bodyKeys } from "@/features/body-selection/api";
import { useBodyOwner } from "@/features/body-selection/hooks";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReviewModel } from "../preview/mountReviewModel";
import { apiFetchResponse } from "@/shared/api/client";
import { useExportStore } from "@/features/export/store/exportStore";
import {
  framedExportUrl,
  rememberFramedFormat,
  type ReviewedIdentity,
} from "@/features/export/lib/framedExport";
import {
  loadPreparedImage,
  preparedIdentity,
  preparedUrl,
} from "@/features/export/lib/preparedArtifact";
import { useModelStore } from "@/features/models/store/modelStore";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { resolveCharacter } from "@/features/models/lib/resolveCharacter";
import { usePoseSelectionStore } from "../store/poseSelectionStore";
import { previewScope, scopeIncludesHands, SCOPE_LABELS } from "../api/outputScope";
import { useSelectionReview } from "./useSelectionReview";

type PreparedReview = Partial<BodyReview> & {
  binding: string;
  image: string;
  identity?: ReviewedIdentity;
  handReceipt?: HandReview;
  downloadUrl: string;
};

/** A verified final FBX receipt controls download; its image is independent. */
export function useFramedReview(jobId: string | undefined) {
  const review = useSelectionReview(jobId);
  const owner = useBodyOwner();
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
  const generatedSelected = review.items.some((i) => i.candidate.source === "generation");
  const requiresFbx = format !== "fbx" && generatedSelected;
  const generatedReviewUnavailable = format === "fbx" && generatedSelected && !enabled;
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
    let url = "",
      exportKey = "";
    const characterId = character.characterId ?? catalog.data?.defaultCharacterId ?? "";
    if (enabled && item.exportUrl) {
      try {
        url = framedExportUrl(
          item.exportUrl,
          scope,
          "ready",
          bodyMode ? null : character.characterId,
        );
        exportKey =
          framedExportUrl(item.exportUrl, scope, "fbx", character.characterId) + `#${item.refined}`;
        if (handEntry?.selection) url += `&handSelectionRevision=${handEntry.selection.revision}`;
      } catch {
        /* Invalid server URLs fail closed. */
      }
    }
    const binding = JSON.stringify([
      owner,
      item.personIndex,
      item.candidate.id,
      item.candidate.sourceBvhSha256,
      item.exportUrl,
      item.refined,
      scope,
      bodyMode ? [body?.selectionRevision, body?.resolvedBody, body?.shape] : characterId,
      handEntry?.selection,
    ]);
    return {
      binding,
      scope,
      characterId,
      body,
      handSelection: handEntry?.selection,
      url,
      exportKey,
      handReady:
        !handEntry ||
        (!!handEntry.selection && !handEntry.loading && !handEntry.error && !hands.pending),
    };
  });
  const requestReady = (request: (typeof requests)[number]) =>
    !review.isRefining && request.handReady && (bodyMode ? review.bodies.ready : catalog.isSuccess);
  const selectionsReady = requests.every(requestReady);
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
            "verified-fbx-v1",
            request.binding,
          ]
        : [
            "framed-preview",
            owner,
            request.url,
            review.items[index]?.refined,
            "verified-fbx-v1",
            request.binding,
          ],
      enabled: enabled && requestReady(request) && !!request.url,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<PreparedReview> => {
        const item = review.items[index]!;
        if (bodyMode) {
          const receipt = await loadBodyReview(
            review.data!.jobId,
            item.exportUrl!,
            item.personIndex,
            item.candidate.id,
            request.scope,
            request.body!,
            signal,
            request.handSelection,
            true,
          );
          signal.throwIfAborted();
          return { ...receipt, binding: request.binding, image: "" };
        }
        if (request.handSelection) {
          const receipt = await loadHandReview(
            request.url,
            framedExportUrl(item.exportUrl!, request.scope, "fbx", request.characterId),
            request.handSelection,
            signal,
            true,
          );
          signal.throwIfAborted();
          return {
            ...receipt,
            binding: request.binding,
            downloadUrl: receipt.handReceipt.downloadUrl,
          };
        }
        const response = await apiFetchResponse(request.url, { auth: false, signal });
        const identity = { ...preparedIdentity(response), prepared: true };
        if (
          response.headers.get("X-Standin-Output-Scope") !== request.scope ||
          (item.candidate.sourceBvhSha256 &&
            !item.refined &&
            identity.sourceSha !== item.candidate.sourceBvhSha256)
        )
          throw new ApiError(409, "PREVIEW_CHANGED", "");
        signal.throwIfAborted();
        return {
          binding: request.binding,
          image: "",
          identity,
          downloadUrl: preparedUrl(request.url, identity.reviewKey, "fbx"),
        };
      },
      retry: false,
      staleTime: bodyMode ? 0 : 300_000,
      gcTime: 600_000,
    })),
  });
  // useQueries can expose the previous observer result for one render while its
  // options update. An explicit binding closes that frame as well as late fetches.
  const currentData = requests.map((r, i) =>
    queries[i]?.data?.binding === r.binding ? queries[i]?.data : undefined,
  );
  // Query keys name every current selection. React Query cancels obsolete
  // observers; the signal checks also reject late transports that ignore abort.
  const images = useQueries({
    queries: requests.map((r, i) => ({
      queryKey: ["framed-image", owner, currentData[i]?.downloadUrl ?? r.url],
      enabled: enabled && requestReady(r) && !!currentData[i]?.downloadUrl,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const downloadUrl = currentData[i]!.downloadUrl;
        return { downloadUrl, image: await loadPreparedImage(downloadUrl, signal) };
      },
      retry: false,
      staleTime: 300_000,
      gcTime: 600_000,
    })),
  });
  const preparationError =
    generatedReviewUnavailable ||
    (enabled &&
      (!!hands.error ||
        (bodyMode ? review.bodies.entries.some((e) => e.error) : catalog.isError) ||
        requests.some((r) => !r.url) ||
        queries.some((q) => q.isError)));
  const downloadReady =
    !requiresFbx &&
    !generatedReviewUnavailable &&
    !review.isRefining &&
    (!enabled ||
      (selectionsReady &&
        requests.length > 0 &&
        !preparationError &&
        queries.every((q, i) => !!currentData[i] && q.isSuccess && !q.isFetching)));
  useReviewJourney({
    jobId: review.data?.jobId,
    binding: JSON.stringify([
      review.items.map((i) => [i.personIndex, i.candidate.id, i.exportUrl]),
      requests.map((r) => r.binding),
    ]),
    ready: downloadReady,
    failed: !!preparationError || requiresFbx,
    error:
      queries.find((q) => q.error)?.error ??
      hands.entries.find((e) => e.error)?.error ??
      review.bodies.entries.find((e) => e.error)?.error ??
      catalog.error,
    format,
  });
  const preparationLoading = enabled && !preparationError && !downloadReady;
  const previewLoading =
    enabled && (preparationLoading || images.some((q) => q.isPending || q.isFetching));
  const previewError = enabled && images.some((q) => q.isError);
  useEffect(() => {
    if (!enabled || !downloadReady || bodyMode) return;
    requests.forEach((r, i) => {
      if (currentData[i]?.identity)
        rememberFramedFormat(r.exportKey, false, currentData[i]!.identity);
    });
  }, [bodyMode, enabled, downloadReady, requests, currentData]);
  const initialHands = useRef<string>();
  const handKey = JSON.stringify(
    requests.map((r) => [r.handSelection?.revision, r.handSelection?.library_sha256]),
  );
  const [handsChanged, setHandsChanged] = useState(false);
  useEffect(() => {
    initialHands.current = undefined;
    setHandsChanged(false);
  }, [jobId]);
  useEffect(() => {
    if (!hands.ready) return;
    if (initialHands.current === undefined) initialHands.current = handKey;
    else if (initialHands.current !== handKey) setHandsChanged(true);
  }, [hands.ready, handKey]);
  const revision = downloadRevision(
    jobId ?? "",
    downloadBinding(
      format,
      review.items.map((item, i) => ({
        personIndex: item.personIndex,
        candidateId: item.candidate.id,
        downloadPath: currentData[i]?.downloadUrl ?? "",
      })),
    ),
  );
  return {
    ...review,
    hands,
    items: review.items.map((item, index) => ({
      ...item,
      includesHands: scopeIncludesHands(requests[index]!.scope),
      previewUrl:
        generatedReviewUnavailable && item.candidate.source === "generation"
          ? ""
          : enabled
            ? requestReady(requests[index]!) &&
              currentData[index] &&
              images[index]?.data?.downloadUrl === currentData[index]?.downloadUrl
              ? (images[index]?.data?.image ?? "")
              : ""
            : item.previewUrl,
      previewModel: undefined as ReviewModel | undefined,
      previewReference: !enabled && item.previewReference && item.candidate.source !== "generation",
      onModelStatus: () => {},
      scopeLabel: enabled ? SCOPE_LABELS[requests[index]!.scope] : "",
    })),
    requiresFbx,
    downloadReady,
    preparationLoading,
    preparationError,
    previewLoading,
    previewError,
    downloadLabel: revision.repeated
      ? "다시 다운로드"
      : revision.changed || handsChanged
        ? "변경한 포즈 다운로드"
        : "포즈 다운로드",
    preparationNotice:
      hands.pending || handsChanged
        ? "변경한 손을 적용하고 있어요…"
        : "다운로드할 파일을 준비하고 있어요…",
    previewFailure: poseRecovery(
      queries.find((q) => q.isError)?.error ??
        review.bodies.entries.find((e) => e.error)?.error ??
        hands.entries.find((e) => e.error)?.error ??
        catalog.error,
    ),
    shapedBake: bodyMode && review.bodies.entries.some((e) => !!e.selection?.shape),
    previewNotice: requiresFbx
      ? "새로 만든 포즈는 FBX로 저장해 주세요."
      : enabled
        ? "파일 준비가 끝나면 다운로드할 수 있어요. 미리보기는 이어서 표시돼요."
        : format === "bvh"
          ? "BVH에는 전체 동작만 저장돼요. 체형·손 모양과 출력 범위는 FBX에 적용돼요."
          : "",
    retryPreview: async () => {
      if (generatedReviewUnavailable) {
        await review.refetch();
        return;
      }
      if (preparationError) {
        if (hands.enabled) await Promise.all(hands.entries.map((e) => e.retry()));
        if (bodyMode) await Promise.all(review.bodies.entries.map((e) => e.retry()));
        else await catalog.refetch();
        await Promise.all(queries.map((q) => q.refetch()));
      } else await Promise.all(images.map((q) => q.refetch()));
    },
    // Only the explicit download button arms SavePage's existing save flow.
    requestDownload: () => {
      if (!downloadReady) return false;
      if (review.data?.jobId) requestExport(review.data.jobId);
      useExportStore.getState().clearError();
      return true;
    },
  };
}
