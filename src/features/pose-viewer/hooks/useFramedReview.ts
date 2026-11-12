import { canUseInteractiveOperations } from "@/features/pose-viewer/interactive/capability";
import { loadPreparedFbx } from "@/features/export/lib/preparedFbx";
import { apiFetchBytes } from "@/shared/api/client";
import { verifyDigest } from "@/features/body-selection/api";
import { outlineAppearance } from "../outline/appearance";
import { selectedSkin } from "../skin/skin";
import {
  isSkinFailure,
  permanentSkinFailure,
  SKIN_SCOPE_NOTE,
  skinFailureScope,
  skinScopeError,
  skinSupportsScope,
} from "../skin/skinScope";
import { queueRepresentativeFrame } from "../interactive/history";
import { historyUpload } from "../interactive/historyHttp";
import { solvedCamera } from "../interactive/solved";
import { useInteractiveReviews } from "../interactive/useInteractiveReviews";
import { env } from "@/shared/lib/env";
import type { InteractiveReviewData } from "../interactive/InteractiveReview";
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
  preparedFile,
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

/** poseRecovery, plus skin failures that only a skin change can fix. */
function reviewRecovery(error: unknown) {
  const recovery = poseRecovery(error);
  const scope = skinFailureScope(error);
  return {
    ...recovery,
    message: scope
      ? `${SKIN_SCOPE_NOTE} 이 포즈는 ${SCOPE_LABELS[scope]} 범위예요. 기본 스킨으로 바꾸면 저장할 수 있어요.`
      : recovery.message,
    retryUseless: permanentSkinFailure(error),
  };
}

/** A verified final FBX receipt controls download; its image is independent. */
export function useFramedReview(jobId: string | undefined) {
  const review = useSelectionReview(jobId);
  const owner = useBodyOwner();
  const releaseMode = review.items.some((i) => !!i.release);
  const bodyMode = review.bodies.enabled && !releaseMode;
  const [failedModels, setFailedModels] = useState<Record<string, boolean>>({});
  const [releaseRendered, setReleaseRendered] = useState<Record<string, boolean>>({});
  const releaseModels = useQueries({
    queries: review.items.map((item) => ({
      queryKey: [
        "release-rc4-preview",
        owner,
        item.release?.previewUrl,
        item.release?.preview_sha256,
      ],
      enabled: !!item.release && !review.isRefining,
      retry: false,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ReviewModel> => {
        const receipt = item.release!;
        const parsed = new URL(receipt.previewUrl, "https://standin.invalid");
        if (
          parsed.origin !== "https://standin.invalid" ||
          !/^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/refine\/release\/preview$/.test(
            parsed.pathname,
          )
        )
          throw new Error("invalid preview route");
        const bytes = await apiFetchBytes(receipt.previewUrl, { auth: false, signal });
        const data = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        await verifyDigest(data, receipt.preview_sha256);
        signal.throwIfAborted();
        return {
          data,
          characterId: "rc4-verified-source",
          scope: "full",
          releaseCamera: receipt.camera,
          sourceSha: receipt.artifact_sha256,
        };
      },
    })),
  });
  const format = useExportStore((s) => s.format);
  const hands = useHands(
    review.data,
    review.items.map((i) => i.personIndex),
    format === "fbx" && !releaseMode,
  );
  const outlines = usePoseSelectionStore((s) => s.outlineByPerson);
  const skins = usePoseSelectionStore((s) => s.skinByPerson);
  const setPersonSkin = usePoseSelectionStore((s) => s.setPersonSkin);
  const outlineEditing = usePoseSelectionStore((s) => s.outlineEditingByPerson);
  const pinned = usePoseSelectionStore((s) => s.characterId);
  const byPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const catalog = useModelCatalog();
  const interactiveEnabled =
    !releaseMode &&
    env.interactivePreview &&
    canUseInteractiveOperations(review.data?.capabilities) &&
    review.data?.capabilities.fbxExport === true &&
    format === "fbx";
  const enabled =
    !releaseMode &&
    !interactiveEnabled &&
    format === "fbx" &&
    review.data?.capabilities.fbxExport === true &&
    (bodyMode || review.data.capabilities.outputScopeCropping === true);
  const generatedSelected = review.items.some((i) => i.candidate.source === "generation");
  const requiresFbx = format !== "fbx" && (generatedSelected || releaseMode);
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
    const appearance = outlineAppearance(outlines?.[item.personIndex] ?? 0);
    const skin = selectedSkin(skins?.[item.personIndex] ?? "default");
    const baseIdentity = [
      owner,
      item.personIndex,
      item.candidate.id,
      item.candidate.sourceBvhSha256,
      item.exportUrl,
      item.refined,
      scope,
      bodyMode ? [body?.selectionRevision, body?.resolvedBody, body?.shape] : characterId,
    ];
    const poseBinding = JSON.stringify(baseIdentity);
    const baseBinding = JSON.stringify([...baseIdentity, handEntry?.selection]);
    const binding = JSON.stringify([baseBinding, appearance, ...(skin ? [skin] : [])]);
    return {
      binding,
      baseBinding,
      poseBinding,
      appearance,
      skin,
      editing: outlineEditing?.[item.personIndex] === true,
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
    !review.isRefining &&
    !request.editing &&
    request.handReady &&
    (bodyMode ? review.bodies.ready : catalog.isSuccess);
  const selectionsReady = requests.every(requestReady);
  const interactive = useInteractiveReviews({
    enabled: interactiveEnabled,
    owner,
    jobId: review.data?.jobId,
    requests: requests.map((r, i) => ({
      binding: r.binding,
      baseBinding: r.baseBinding,
      poseBinding: r.poseBinding,
      personIndex: review.items[i].personIndex,
      candidateId: review.items[i].candidate.id,
      ready: requestReady(r),
      appearance: r.appearance,
      skin: r.skin,
    })),
  });
  const interactiveErrors = interactive.snapshots.map(
    (s, i) =>
      s.binding === requests[i]?.binding &&
      (!!s.error || !!s.failure || s.exportState === "failed"),
  );
  // Older servers only answer SKIN_DISABLED; the person's cropped scope is known here too.
  const reviewFailure = (i: number) => {
    const failure = interactive.snapshots[i]?.failure,
      request = requests[i];
    return request?.skin &&
      !skinSupportsScope(request.scope) &&
      isSkinFailure(failure) &&
      !skinFailureScope(failure)
      ? skinScopeError(request.scope)
      : failure;
  };
  const failingIndex = interactiveErrors.findIndex(Boolean);
  const interactiveFailure =
    failingIndex >= 0 ? { failure: reviewFailure(failingIndex) } : undefined;
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
      enabled:
        enabled && !request.appearance && !request.skin && requestReady(request) && !!request.url,
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
          file: preparedFile(response),
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
  const models = useQueries({
    queries: requests.map((r, i) => ({
      queryKey: ["framed-model", owner, currentData[i]?.downloadUrl ?? r.url, r.binding],
      enabled: enabled && requestReady(r) && !!currentData[i]?.file,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const receipt = currentData[i]!;
        const data = await loadPreparedFbx(receipt.downloadUrl, receipt.file!, signal);
        signal.throwIfAborted();
        return {
          downloadUrl: receipt.downloadUrl,
          model: {
            data,
            format: "fbx",
            characterId: r.characterId,
            scope: r.scope,
            sourceSha: receipt.file!.identity.sourceSha,
          } satisfies ReviewModel,
        };
      },
      retry: false,
      staleTime: 300_000,
      gcTime: 0, // large file bytes belong to the bounded download cache, not history
    })),
  });
  const imageFallback = (i: number) =>
    !currentData[i]?.file ||
    models[i]?.isError ||
    failedModels[currentData[i]?.downloadUrl ?? ""] === true;
  const images = useQueries({
    queries: requests.map((r, i) => ({
      queryKey: ["framed-image", owner, currentData[i]?.downloadUrl ?? r.url],
      enabled: enabled && requestReady(r) && !!currentData[i]?.downloadUrl && imageFallback(i),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const downloadUrl = currentData[i]!.downloadUrl;
        return { downloadUrl, image: await loadPreparedImage(downloadUrl, signal) };
      },
      retry: false,
      staleTime: 300_000,
      gcTime: 600_000,
    })),
  });
  const outlineUnsupported =
    !releaseMode && !interactiveEnabled && requests.some((r) => !!r.appearance);
  const skinUnsupported = !releaseMode && !interactiveEnabled && requests.some((r) => !!r.skin);
  const preparationError =
    outlineUnsupported ||
    skinUnsupported ||
    (!interactiveEnabled && generatedReviewUnavailable) ||
    (enabled &&
      (!!hands.error ||
        (bodyMode ? review.bodies.entries.some((e) => e.error) : catalog.isError) ||
        requests.some((r) => !r.url) ||
        queries.some((q) => q.isError)));
  const downloadReady = releaseMode
    ? !review.isRefining &&
      !requiresFbx &&
      review.items.every(
        (item, i) =>
          !!item.release &&
          releaseModels[i]?.isSuccess &&
          releaseRendered[item.release.preview_sha256] === true,
      )
    : interactiveEnabled
      ? interactive.ready
      : !outlineUnsupported &&
        !skinUnsupported &&
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
    failed: (interactiveEnabled ? interactive.failed : !!preparationError) || requiresFbx,
    error:
      interactiveFailure?.failure ??
      queries.find((q) => q.error)?.error ??
      hands.entries.find((e) => e.error)?.error ??
      review.bodies.entries.find((e) => e.error)?.error ??
      catalog.error,
    format,
  });
  const preparationLoading = enabled && !preparationError && !downloadReady;
  const previewLoading =
    enabled &&
    !preparationError &&
    (preparationLoading ||
      requests.some((_, i) => {
        const q = imageFallback(i) ? images[i] : models[i];
        return q?.isPending || q?.isFetching;
      }));
  const previewError =
    enabled && (preparationError || images.some((q, i) => imageFallback(i) && q.isError));
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
        downloadPath: interactiveEnabled
          ? (interactive.snapshots[i]?.operation?.fileUrl ?? "")
          : (currentData[i]?.downloadUrl ?? ""),
      })),
    ),
  );
  const failure =
    interactiveFailure?.failure ??
    (outlineUnsupported ? new ApiError(422, "OUTLINE_UNSUPPORTED", "") : undefined) ??
    (skinUnsupported ? new ApiError(422, "SKIN_UNSUPPORTED", "") : undefined) ??
    queries.find((q) => q.isError)?.error ??
    review.bodies.entries.find((e) => e.error)?.error ??
    hands.entries.find((e) => e.error)?.error ??
    catalog.error;
  // Only the skins that failed (or never fit their scope) go back to default; nothing else changes.
  const skinBlocked = requests.map(
    (r, i) =>
      !!r.skin &&
      (skinUnsupported ||
        !skinSupportsScope(r.scope) ||
        (interactiveErrors[i] === true && isSkinFailure(reviewFailure(i)))),
  );
  const switchToDefaultSkin =
    isSkinFailure(failure) && skinBlocked.some(Boolean)
      ? () =>
          review.items.forEach((item, i) => {
            if (skinBlocked[i]) setPersonSkin(item.personIndex, "default");
          })
      : undefined;
  return {
    ...review,
    hands,
    items: review.items.map((item, index) => ({
      ...item,
      outlineWidth: outlines?.[item.personIndex] ?? 0,
      skin: requests[index]!.skin,
      skinAvailable: interactiveEnabled && interactive.snapshots[index]?.skinAvailable === true,
      supportedSkins: interactive.snapshots[index]?.supportedSkins ?? ["default"],
      outlineAvailable:
        interactiveEnabled && interactive.snapshots[index]?.appearanceAvailable === true,
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
      interactivePreview: interactiveEnabled
        ? ({
            skin: requests[index]!.skin,
            selectionSkin: {
              location: `/v1/analysis/jobs/${review.data?.jobId}/people/${item.personIndex}`,
              candidateId: item.candidate.id,
              baseBinding: requests[index]!.baseBinding,
            },
            skinPreview:
              interactive.snapshots[index]?.modelBinding === requests[index]!.baseBinding
                ? interactive.snapshots[index]?.modelOperation?.skinPreview
                : undefined,
            skinState: interactive.snapshots[index]?.modelOperation?.stateHash
              ? {
                  stateHash: interactive.snapshots[index]!.modelOperation!.stateHash!,
                  revision: interactive.snapshots[index]!.modelOperation!.revision,
                }
              : undefined,
            outlineWidth: outlines?.[item.personIndex] ?? 0,
            model:
              interactive.snapshots[index]?.modelBinding === requests[index]!.baseBinding &&
              interactive.snapshots[index]?.model?.state.identity.selection.candidate ===
                item.candidate.id
                ? interactive.snapshots[index]?.model
                : undefined,
            asset: item.candidate.interactivePreview?.asset,
            viewKey: `${review.data?.jobId}:${item.personIndex}:review`,
            failed: interactiveErrors[index] || interactive.snapshots[index]?.modelError === true,
            localSurface: interactive.snapshots[index]?.localSurface,
            onFrame:
              index === 0
                ? (element: HTMLElement) => {
                    const controller = interactive.controllers[index];
                    const snapshot = controller?.snapshot();
                    const model = snapshot?.model;
                    const operation = snapshot?.operation;
                    if (!controller || !model?.frame || !operation) return;
                    queueRepresentativeFrame(
                      controller,
                      element,
                      solvedCamera(model.state, model.frame),
                      historyUpload(controller.target, operation),
                    );
                  }
                : undefined,
            notice: review.isRefining
              ? "포즈 보정 중"
              : interactiveErrors[index]
                ? reviewRecovery(reviewFailure(index)).message
                : interactive.snapshots[index]?.localSurface
                  ? "변경 적용 중"
                  : interactive.snapshots[index]?.binding !== requests[index]?.binding
                    ? "변경 적용 중"
                    : interactive.snapshots[index]?.modelError
                      ? "3D를 다시 준비해 주세요. 파일은 준비되면 다운로드할 수 있어요."
                      : interactive.ready
                        ? ""
                        : "파일 준비 중",
          } as InteractiveReviewData)
        : undefined,
      previewModel: item.release
        ? releaseModels[index]?.data
        : enabled &&
            !imageFallback(index) &&
            requestReady(requests[index]!) &&
            models[index]?.data?.downloadUrl === currentData[index]?.downloadUrl
          ? models[index]?.data?.model
          : undefined,
      previewReference: !enabled && item.previewReference && item.candidate.source !== "generation",
      onModelStatus: (status: "ready" | "failed") => {
        const url = currentData[index]?.downloadUrl;
        if (!item.release && url && status === "failed")
          setFailedModels((previous) => ({ ...previous, [url]: true }));
        if (item.release)
          setReleaseRendered((previous) => ({
            ...previous,
            [item.release!.preview_sha256]: status === "ready",
          }));
      },
      scopeLabel: enabled ? SCOPE_LABELS[requests[index]!.scope] : "",
    })),
    requiresFbx,
    downloadReady,
    preparationLoading: releaseMode
      ? !downloadReady && !releaseModels.some((q) => q.isError)
      : interactiveEnabled
        ? !interactive.ready && !interactive.failed
        : preparationLoading,
    preparationError: releaseMode
      ? releaseModels.some((q) => q.isError)
      : interactiveEnabled
        ? interactive.failed
        : preparationError,
    previewLoading: releaseMode ? releaseModels.some((q) => q.isPending) : previewLoading,
    previewError: releaseMode
      ? releaseModels.some((q) => q.isError)
      : interactiveEnabled
        ? interactiveErrors.some(Boolean) || interactive.snapshots.some((s) => s.modelError)
        : previewError,
    downloadLabel: revision.repeated
      ? "다시 다운로드"
      : revision.changed || handsChanged
        ? "변경한 포즈 다운로드"
        : "포즈 다운로드",
    preparationNotice:
      interactiveEnabled && interactive.failed
        ? reviewRecovery(interactiveFailure?.failure).message
        : preparationError
          ? "파일을 준비하지 못했어요. 다시 시도해 주세요."
          : hands.pending || handsChanged
            ? "변경한 손을 적용하고 있어요…"
            : "다운로드할 파일을 준비하고 있어요…",
    previewFailure: {
      ...reviewRecovery(failure),
      switchToDefaultSkin,
    },
    shapedBake: bodyMode && review.bodies.entries.some((e) => !!e.selection?.shape),
    previewNotice: releaseMode
      ? "검증한 원본 체형으로 보정한 포즈입니다. 체형·손·출력 범위 변경은 적용되지 않습니다."
      : requiresFbx
        ? "새로 만든 포즈는 FBX로 저장해 주세요."
        : enabled
          ? "파일 준비가 끝나면 다운로드할 수 있어요. 미리보기는 이어서 표시돼요."
          : format === "bvh"
            ? "BVH에는 전체 동작만 저장돼요. 체형·손 모양과 출력 범위는 FBX에 적용돼요."
            : "",
    retryPreview: async () => {
      if (releaseMode) {
        await Promise.all(releaseModels.map((q) => q.refetch()));
        return;
      }
      if (interactiveEnabled) {
        interactive.retry();
        return;
      }
      if (generatedReviewUnavailable) {
        await review.refetch();
        return;
      }
      if (preparationError) {
        if (hands.enabled) await Promise.all(hands.entries.map((e) => e.retry()));
        if (bodyMode) await Promise.all(review.bodies.entries.map((e) => e.retry()));
        else await catalog.refetch();
        await Promise.all(queries.map((q) => q.refetch()));
      } else {
        setFailedModels({});
        await Promise.all(
          requests.map((_, i) =>
            currentData[i]?.file ? models[i]!.refetch() : images[i]!.refetch(),
          ),
        );
      }
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
