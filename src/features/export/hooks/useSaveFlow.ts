import {
  prepareOriginalScene,
  validateSceneManifest,
  SCENE_MANIFEST_VERSION,
  type SceneManifest,
  type OriginalSceneReceipt,
} from "../api/sceneMetadata";
import {
  saveCoverage,
  sceneUnavailableMessage,
  sceneSelectionAvailable,
} from "../lib/saveCoverage";
import { saveConsentBinding } from "../lib/saveBinding";
import { jobFileName } from "../lib/jobFileName";
import { failureProperties } from "@/features/analytics/featureJourney";
import { isTauri } from "@tauri-apps/api/core";
import {
  attemptProperties,
  requestExport,
  takeExportAttempt,
} from "@/features/analytics/journeyAttempts";
import { invalidateFinalReview } from "../lib/invalidateFinalReview";
import {
  downloadBinding,
  downloadRevision,
  rememberDownload,
  revisionFileName,
} from "../lib/downloadRevisions";
import { poseRecovery } from "@/shared/api/poseRecovery";
import { verifyDigest } from "@/features/body-selection/api";
import { canRelease } from "@/features/pose-viewer/api/routedSearch";
import { handKeys, downloadHandReview, type HandReview } from "@/features/hand-selection/api";
import type { HandSelection } from "@/features/hand-selection/contract";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyKeys } from "@/features/body-selection/api";
import { downloadBodyReview, type BodyReview } from "@/features/body-selection/review";
import type { BodySelection } from "@/features/body-selection/contract";
import {
  framedExportUrl,
  reviewedModelFormat,
  reviewedExportUrl,
  reviewedArtifactSha,
} from "../lib/framedExport";
import {
  previewScope,
  scopeIncludesHands,
  type BodyScope,
} from "@/features/pose-viewer/api/outputScope";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetchBytes } from "@/shared/api/client";
import { env } from "@/shared/lib/env";
import { ApiError, isAppError, toAppError } from "@/shared/api/errors";
import { copyText } from "@/shared/lib/copyText";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { currentSurface, trackEvent } from "@/features/analytics/analyticsClient";
import { exportService } from "../api/export.service";
import {
  downloadScene,
  prepareScene,
  loadScenePreview,
  sceneReference,
  type SceneReview,
  type SceneSaveMode,
} from "../api/scene";
import { ExportError } from "../api/export.contract";
import { personFileName, withFormatExtension } from "../lib/defaultFileName";
import { mockBvhContent } from "../lib/mockBvhContent";
import { useModelStore } from "@/features/models/store/modelStore";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { resolveCharacter } from "@/features/models/lib/resolveCharacter";
import { useExportStore, type ExportFormat } from "../store/exportStore";

/** 저장 파라미터를 export URL에 싣는다. URL에는 이미 jobId·personIndex·candidateId가 있다. */
export function withExportParams(
  url: string,
  format: ExportFormat,
  characterId: string | null,
): string {
  const params = new URLSearchParams({ format });
  // BVH는 동작만 담는다 — 체형이 들어갈 자리가 없다. 그래도 붙이면 서버 로그가
  // "이 체형으로 만들었다"고 거짓말을 한다.
  if (characterId && format === "fbx") params.set("characterId", characterId);
  return `${url}${url.includes("?") ? "&" : "?"}${params}`;
}

/**
 * 서버가 확정한 최종 포즈 파일 바이트를 받아온다. 없으면(Mock 후보) placeholder로 대체.
 *
 * FBX는 바이너리다. 텍스트로 받으면 UTF-8 디코딩이 바이트를 망가뜨리고, 그렇게 저장된
 * 파일은 "저장 성공"으로 보이면서 클립스튜디오에서만 열리지 않는다.
 */
async function resolvePoseBytes(
  exportUrl: string | undefined,
  candidateId: string,
  format: ExportFormat,
  characterId: string | null,
  scope?: BodyScope,
  modelPreview = false,
  refined = false,
  onDownloadPath?: (path: string) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  // 포즈 서버가 Mock이면 바이트도 Mock이다. exportUrl 유무만 보던 시절에는 refine을 거친
  // 인물에서 막혔다 — refine mock이 실서버만 서빙할 수 있는 URL을 주기 때문이다.
  // exportUrl을 optional로 낮추는 대신 여기서 갈라낸다: "미리보기와 저장이 같은 URL"은
  // 낮추면 안 되는 production 계약이다(refine.contract.ts).
  if (env.useMockPoseApi && !env.isProduction) {
    return mockBvhContent(candidateId);
  }
  if (!exportUrl) throw new ApiError(409, "INVALID_EXPORT", "");
  try {
    const url =
      scope && format === "fbx"
        ? framedExportUrl(
            exportUrl,
            scope,
            "fbx",
            characterId,
            reviewedModelFormat(
              framedExportUrl(exportUrl, scope, "fbx", characterId) + `#${refined}`,
              modelPreview,
            ),
          )
        : withExportParams(exportUrl, format, characterId);
    const pinnedUrl =
      scope && format === "fbx"
        ? reviewedExportUrl(
            url,
            framedExportUrl(exportUrl, scope, "fbx", characterId) + `#${refined}`,
          )
        : url;
    onDownloadPath?.(pinnedUrl);
    const bytes = await apiFetchBytes(pinnedUrl, { auth: false, ...(signal ? { signal } : {}) });
    const digest =
      scope && format === "fbx"
        ? reviewedArtifactSha(framedExportUrl(exportUrl, scope, "fbx", characterId) + `#${refined}`)
        : undefined;
    if (digest)
      await verifyDigest(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        digest,
      );
    return bytes;
  } catch (error) {
    // 격리된 포즈, converter 거부, lineage 불일치는 모두 **재시도로 풀리지 않는다.** 일반
    // 실패로 뭉치면 사용자는 영원히 실패하는 재시도 버튼만 누르게 된다. 코드별 문구는
    // errorMessages가 갖고 있다 — 서버 원문을 화면에 그대로 쓰지 않는다.
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "EXPORT_FAILED", "");
  }
}

/**
 * 저장 오케스트레이션(docs/12 §3~4, ADR-009).
 *
 * 저장은 화면에 들어오면 **자동으로** 시작한다. 사용자가 폴더와 파일 이름을 확인하고
 * 저장 버튼을 누르는 단계를 없앴다 — 마찰의 대부분이 거기 있었기 때문이다. 저장 폴더는
 * 설정에서 한 번 정하고, 이 화면에서는 결과를 알리고 클립스튜디오로 넘기는 일만 한다.
 *
 * 앱 모드(SavePage)와 바 모드(BarSavePage)가 이 훅을 공유하고 뷰만 다르다.
 */
export function useSaveFlow(jobId: string | undefined) {
  const queryClient = useQueryClient();
  const draft = useUploadStore((s) => s.draft);
  const clearDraft = useUploadStore((s) => s.clearDraft);
  const excludedPeople = usePoseSelectionStore((s) => s.excludedPeople);
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const clearSelection = usePoseSelectionStore((s) => s.clearSelection);

  const folder = useExportStore((s) => s.folder);
  const preferredFormat = useExportStore((s) => s.format);
  const fileName = useExportStore((s) => s.fileName);
  const status = useExportStore((s) => s.status);
  const savedPaths = useExportStore((s) => s.savedPaths);
  const error = useExportStore((s) => s.error);
  const errorCode = useExportStore((s) => s.errorCode);
  const setFolder = useExportStore((s) => s.setFolder);
  const setFileName = useExportStore((s) => s.setFileName);
  const setPhase = useExportStore((s) => s.setPhase);
  const startSaving = useExportStore((s) => s.startSaving);
  const setSaved = useExportStore((s) => s.setSaved);
  const addSaved = useExportStore((s) => s.addSaved);
  const setError = useExportStore((s) => s.setError);
  const clearError = useExportStore((s) => s.clearError);
  const reset = useExportStore((s) => s.reset);
  const beginJob = useExportStore((s) => s.beginJob);

  const pinnedCharacterId = usePoseSelectionStore((s) => s.characterId);
  const characterByPerson = usePoseSelectionStore((s) => s.characterByPerson);
  const preferredCharacterId = useModelStore((s) => s.preferredCharacterId);
  const { data: modelCatalog } = useModelCatalog();

  const selections = Object.entries(selectedByPerson);
  const selectionCount = selections.length;
  const isSaved = status === "saved" && savedPaths.length > 0;

  /**
   * 실제로 저장할 포맷. 설정값은 "가능하면 이 포맷"이라는 뜻이고, FBX를 노출하지 않는
   * 배포에서는 BVH로 내려간다(`capabilities.fbxExport`). 여기서 좁히지 않으면 저장이
   * 전건 409로 실패한다.
   */
  const serverSupportsFbx =
    queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId ?? ""))?.capabilities
      .fbxExport === true;
  const effectiveFormat: ExportFormat =
    preferredFormat === "fbx" && !serverSupportsFbx ? "bvh" : preferredFormat;
  /** 사용자가 FBX를 골랐는데 서버가 못 주는 상태. 저장 화면이 이유를 알려 줘야 한다. */
  const formatDowngraded = preferredFormat === "fbx" && effectiveFormat === "bvh";

  /**
   * 이 작업을 어떤 체형으로 저장하는가(ADR-013).
   *
   * ⚠ capability는 훅이 아니라 쿼리 캐시에서 직접 읽는다(위 `serverSupportsFbx`와 같은
   * 자리). 세션이 끝나면 캐시가 비워지므로(`sessionCacheReset`) "모름"이 될 수 있고,
   * 그때는 파라미터를 붙이지 않아 기본 모델로 저장된다 — 화면 문구도 그렇게 읽혀야 한다.
   */
  const bodyMode =
    queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId ?? ""))?.capabilities
      .bodyPreviews === true;
  const serverSupportsCharacter =
    queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId ?? ""))?.capabilities
      .characterSelection === true;
  /**
   * 인물마다 따로 푼다 — 한 컷에서 인물별로 다른 체형을 고를 수 있다(ADR-013 개정).
   * 고르지 않은 인물은 이 작업의 기본 체형을 쓴다.
   */
  const resolveFor = (personIndex: number) =>
    resolveCharacter({
      pinned: characterByPerson[personIndex] ?? pinnedCharacterId,
      preferred: preferredCharacterId,
      catalog: modelCatalog,
      format: effectiveFormat,
      serverSupportsCharacterSelection: serverSupportsCharacter,
    });

  const defaultCharacterName =
    modelCatalog?.characters.find((item) => item.characterId === modelCatalog.defaultCharacterId)
      ?.displayName ?? null;
  const resolutions = selections.map(([personIndex]) => {
    if (!bodyMode) return resolveFor(Number(personIndex));
    const owner = useInstallationStore.getState().credentials?.installationId ?? "";
    const serverJob =
      queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId ?? ""))?.jobId ?? "";
    const body = queryClient.getQueryData<BodySelection>(
      bodyKeys.selection(owner, serverJob, Number(personIndex)),
    );
    const id = body?.resolvedBody?.characterId ?? null;
    return {
      characterId: id,
      chosen: modelCatalog?.characters.find((c) => c.characterId === id) ?? null,
      downgradeReason: null,
    };
  });
  /** 실제로 쓰인 체형 이름들(중복 제거). 인물마다 다르면 둘 이상이 된다. */
  const usedCharacterNames = [
    ...new Set(
      resolutions.map(
        (r) => (r.characterId ? r.chosen?.displayName : defaultCharacterName) ?? null,
      ),
    ),
  ].filter((name): name is string => name !== null);
  /** 저장에 실제로 쓰인 체형 이름. 인물마다 다르면 null이고 화면이 다른 문구를 고른다. */
  const characterName = usedCharacterNames.length === 1 ? usedCharacterNames[0]! : null;
  /** 인물마다 다른 체형으로 저장했는가. */
  const mixedCharacters = usedCharacterNames.length > 1;
  const firstDowngraded = resolutions.find((r) => r.downgradeReason !== null);
  /** 고른 체형을 못 쓴 이유. 화면이 그대로 문구를 고른다. */
  const characterDowngradeReason = firstDowngraded?.downgradeReason ?? null;
  /** 고르긴 했지만 저장에는 반영되지 않은 체형 이름. 다운그레이드 안내에 쓴다. */
  const requestedCharacterName = firstDowngraded?.chosen?.displayName ?? null;
  /**
   * 기본 모델이 아닌 체형으로 저장을 시도하고 있는가. 저장이 실패했을 때 "기본 모델로
   * 저장" 복구 버튼을 띄울지 결정한다 — 어차피 기본 모델이면 그 버튼은 재시도와 같다.
   */
  const usesCustomCharacter =
    !bodyMode &&
    resolutions.some(
      (r) => r.characterId !== null && r.characterId !== modelCatalog?.defaultCharacterId,
    );

  const analysis = queryClient.getQueryData<AnalysisResult>(poseQueryKeys.result(jobId ?? ""));
  const isSceneExport =
    effectiveFormat === "fbx" &&
    analysis?.source !== "semantic" &&
    sceneSelectionAvailable(analysis, selectedByPerson) &&
    !env.useMockPoseApi;
  const sceneContract = isSceneExport ? analysis?.capabilities.sceneSaveContract : undefined;
  const consentBinding = useSyncExternalStore(
    useCallback(
      (changed) => {
        const offCache = queryClient.getQueryCache().subscribe(changed);
        const offSelection = usePoseSelectionStore.subscribe(changed);
        const offOwner = useInstallationStore.subscribe(changed);
        return () => {
          offCache();
          offSelection();
          offOwner();
        };
      },
      [queryClient],
    ),
    () => saveConsentBinding(queryClient, jobId),
  );
  const coverage = saveCoverage(analysis, selectedByPerson, excludedPeople);
  const partialConsent = useExportStore((s) => s.partialConsentBinding);
  const individualConsent = useExportStore((s) => s.individualConsentBinding);
  const partialRequired = coverage.omitted.length > 0;
  const individualRequired =
    preferredFormat === "fbx" &&
    analysis?.source !== "semantic" &&
    !isSceneExport &&
    !env.useMockPoseApi;
  const needsPartialConfirmation = partialRequired && partialConsent !== consentBinding;
  const needsIndividualConfirmation = individualRequired && individualConsent !== consentBinding;
  const waitingForSaveConsent = needsPartialConfirmation || needsIndividualConfirmation;
  useEffect(() => {
    if (partialConsent !== consentBinding)
      useExportStore.setState({ partialConsentBinding: undefined });
    if (individualConsent !== consentBinding)
      useExportStore.setState({ individualConsentBinding: undefined });
  }, [consentBinding, partialConsent, individualConsent]);
  const currentConsent = useRef({ partialConsent, individualConsent });
  currentConsent.current = { partialConsent, individualConsent };

  const [sceneChoice, setSceneChoice] = useState<{
    jobId: string | undefined;
    mode: SceneSaveMode;
  }>();
  const modeChosen = sceneChoice !== undefined && sceneChoice.jobId === jobId;
  const sceneMode = modeChosen ? sceneChoice.mode : "original-selection";
  const choosingSceneMode =
    !!sceneContract && !modeChosen && status === "idle" && !waitingForSaveConsent;
  const sceneOutputLabel = isSceneExport ? `인물 ${selectionCount}명 · FBX 파일 1개` : null;

  // job이 바뀌었으면 앞선 저장 결과를 먼저 비운다. 파일 이름 기본값을 채우기 전에
  // 실행되어야 한다 — 순서가 뒤집히면 방금 채운 이름을 곧바로 지운다.
  useEffect(() => {
    if (jobId) beginJob(jobId);
  }, [jobId, beginJob]);

  useEffect(() => {
    if (!folder) {
      exportService
        .getDefaultFolder()
        .then(setFolder)
        .catch(() => {});
    }
    // 폴더는 영속값이라 마운트 1회로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 파일 이름은 beginJob이 비울 수 있으므로 마운트 1회가 아니라 비어 있을 때마다 채운다.
  // 확장자는 실제 저장 포맷을 따른다 — 설정에서 포맷을 바꾸면 다음 기본 이름부터 반영된다.
  useEffect(() => {
    if (!fileName && jobId) setFileName(jobFileName(jobId, analysis, draft, effectiveFormat));
  }, [fileName, draft, effectiveFormat, setFileName, analysis, jobId]);

  // 최신 값을 자동 저장 effect에서 읽되, effect가 값 변화마다 재실행되지는 않게 한다.
  const latest = useRef({
    jobId,
    fileName,
    selections,
    queryClient,
    modelCatalog,
    preferredCharacterId,
  });
  latest.current = {
    jobId,
    fileName,
    selections,
    queryClient,
    modelCatalog,
    preferredCharacterId,
  };

  const [serverOperationMayContinue, setServerOperationMayContinue] = useState(false);
  const [errorAllowedActions, setErrorAllowedActions] = useState<string[]>();
  const [selectedSceneImages, setSelectedSceneImages] = useState<Record<number, string>>({});
  const [sceneReview, setSceneReview] = useState<SceneReview | null>(null);
  const sceneDecision = useRef<((accepted: boolean) => void) | null>(null);
  const sceneMounted = useRef(true);
  const scenePreviewController = useRef<AbortController>();
  const activeSave = useRef<AbortController>();
  const writingFile = useRef(false);
  const saveSettled = useRef<Promise<void>>(Promise.resolve());
  const cancelSave = () => {
    if (writingFile.current) return;
    activeSave.current?.abort(new ExportError("CANCELLED", "장면 저장을 취소했습니다."));
    sceneDecision.current?.(false);
    sceneDecision.current = null;
    scenePreviewController.current?.abort();
    setSceneReview(null);
    if (activeSave.current) setPhase("cancelled");
  };
  useEffect(() => {
    sceneMounted.current = true;
    return () => {
      sceneMounted.current = false;
      // StrictMode may immediately re-run setup; only an actual departure cancels.
      queueMicrotask(() => {
        if (sceneMounted.current) return;
        if (!writingFile.current) {
          activeSave.current?.abort(new ExportError("CANCELLED", "장면 저장을 취소했습니다."));
          if (activeSave.current) useExportStore.getState().setPhase("cancelled");
        }
        sceneDecision.current?.(false);
        scenePreviewController.current?.abort();
      });
    };
  }, []);
  const previousJob = useRef(jobId);
  useEffect(() => {
    if (previousJob.current === jobId) return;
    previousJob.current = jobId;
    if (!writingFile.current) activeSave.current?.abort(new ExportError("CANCELLED", ""));
    sceneDecision.current?.(false);
    sceneDecision.current = null;
    scenePreviewController.current?.abort();
    setSceneReview(null);
    setSelectedSceneImages({});
  }, [jobId]);

  const decideScene = (accepted: boolean) => {
    if (!accepted) {
      cancelSave();
      return;
    }
    scenePreviewController.current?.abort();
    const decide = sceneDecision.current;
    sceneDecision.current = null;
    setSceneReview(null);
    decide?.(accepted);
  };

  const runSave = useCallback(
    /**
     * `append`는 앞선 저장 결과를 **남긴 채** 목록에 더한다. 같은 포즈를 다른 포맷으로 한
     * 번 더 저장하는 경우만 해당한다 — 재시도와 다른 폴더 저장은 앞선 결과를 대체한다.
     */
    async (
      targetFolder: string,
      format: ExportFormat,
      options: {
        append?: boolean;
        forceDefaultCharacter?: boolean;
        sceneMode?: SceneSaveMode;
      } = {},
    ) => {
      const {
        jobId: id,
        fileName: rawName,
        selections: picks,
        queryClient: qc,
        modelCatalog: catalog,
        preferredCharacterId: preferred,
      } = latest.current;
      if (!targetFolder || !rawName || !id || picks.length === 0) return;
      const currentAnalysis = qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id));
      const currentState = usePoseSelectionStore.getState();
      const currentCoverage = saveCoverage(
        currentAnalysis,
        currentState.selectedByPerson,
        currentState.excludedPeople,
      );
      const binding = saveConsentBinding(qc, id);
      if (
        (currentCoverage.omitted.length > 0 && currentConsent.current.partialConsent !== binding) ||
        ((format === "fbx" || preferredFormat === "fbx") &&
          currentAnalysis?.source !== "semantic" &&
          !sceneSelectionAvailable(currentAnalysis, currentState.selectedByPerson) &&
          !env.useMockPoseApi &&
          currentConsent.current.individualConsent !== binding)
      ) {
        autoSaveStarted.current = undefined;
        useExportStore.setState({ status: "idle" });
        return;
      }
      // 이름의 확장자와 실제 내용이 어긋나면 클립스튜디오는 열지 못하면서 이유는 알려 주지
      // 않는다. 이름은 설정에서 포맷을 바꾸기 전에 정해졌을 수 있으므로 여기서 맞춘다.
      const name = withFormatExtension(rawName, format);

      if (activeSave.current || !sceneMounted.current) return;
      const serverJob = qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id))?.jobId;
      const attempt = serverJob ? takeExportAttempt(serverJob) : undefined;
      let telemetryPhase = "preparing";
      const controller = new AbortController();
      activeSave.current = controller;
      let settle!: () => void;
      saveSettled.current = new Promise<void>((resolve) => {
        settle = resolve;
      });
      let sceneRequest = false;
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => {};
      let unsubscribeQueries = () => {};
      let unsubscribeOwner = () => {};
      setServerOperationMayContinue(false);
      setErrorAllowedActions(undefined);
      setPhase("preparing");
      try {
        const analysisResult = qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id));
        if (!analysisResult) {
          throw new ApiError(409, "INVALID_SELECTION", "");
        }
        const snapshot = () =>
          JSON.stringify({
            routeJob: latest.current.jobId,
            job: usePoseSelectionStore.getState().jobId,
            owner: useInstallationStore.getState().credentials?.installationId,
            selected: usePoseSelectionStore.getState().selectedByPerson,
            excluded: usePoseSelectionStore.getState().excludedPeople,
            character: usePoseSelectionStore.getState().characterId,
            characters: usePoseSelectionStore.getState().characterByPerson,
            refine: usePoseSelectionStore.getState().refineByPerson,
            people: qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id))?.people,
            body: qc
              .getQueriesData({
                queryKey: [
                  "body",
                  useInstallationStore.getState().credentials?.installationId ?? "",
                  analysisResult.jobId,
                ],
                predicate: (q) => q.queryKey[4] === "selection",
              })
              .map(([key, data]) => [key, data]),
            hands: qc.getQueriesData({
              queryKey: [
                "hands",
                useInstallationStore.getState().credentials?.installationId ?? "",
                analysisResult.jobId,
              ],
            }),
          });
        const bindingAtStart = snapshot();
        const checkSelection = () => {
          if (snapshot() !== bindingAtStart) {
            controller.abort(new ApiError(409, "PREVIEW_CHANGED", ""));
            sceneDecision.current?.(false);
            sceneDecision.current = null;
            scenePreviewController.current?.abort();
            if (sceneMounted.current) setSceneReview(null);
          }
        };
        unsubscribe = usePoseSelectionStore.subscribe(checkSelection);
        unsubscribeOwner = useInstallationStore.subscribe(checkSelection);
        unsubscribeQueries = qc.getQueryCache().subscribe(checkSelection);
        const selectionState = usePoseSelectionStore.getState();
        const refineByPerson = selectionState.refineByPerson;
        /**
         * 체형은 **인물마다** 푼다(ADR-013 개정). 고르지 않은 인물은 이 작업의 기본
         * 체형으로 떨어진다. 포맷은 인자를 따르므로 "다른 포맷으로도 저장"이 BVH를
         * 고르면 여기서 자동으로 파라미터가 빠진다.
         */
        const characterFor = (personIndex: number) =>
          options.forceDefaultCharacter
            ? null
            : resolveCharacter({
                pinned: selectionState.characterByPerson[personIndex] ?? selectionState.characterId,
                preferred,
                catalog,
                format,
                serverSupportsCharacterSelection: analysisResult.capabilities.characterSelection,
              }).characterId;
        const bodyNames = new Set<string>();
        const files = await Promise.all(
          picks.map(async ([personIndexStr, candidateId]) => {
            const personIndex = Number(personIndexStr);
            const person = analysisResult.people.find((p) => p.index === personIndex);
            const scope = previewScope(person);
            const handApplicable =
              analysisResult.capabilities.handSelection && scopeIncludesHands(scope);
            const candidate = person?.candidates.find((c) => c.id === candidateId);
            if (!candidate) {
              throw new ApiError(409, "INVALID_SELECTION", "");
            }
            if (candidate.source === "generation" && format !== "fbx")
              throw new ApiError(409, "GENERATED_FBX_REQUIRED", "");
            if (!canRelease(candidate)) throw new ApiError(409, "MANUAL_SELECTION_REQUIRED", "");
            // 조정 결과가 있으면 BFF가 확정한 URL이 최종이다. 확인 화면이 보여 준 것과
            // 같은 URL이어야 "본 것과 저장된 것이 다르다"가 생기지 않는다.
            // 어느 쪽이든 BFF 경로다 — 추론 서버의 /refined/{handle}는 그 태스크의 로컬
            // 디스크라 태스크가 교체되면 사라진다(FE-05).
            const outcome = refineByPerson[personIndex];
            const currentOutcome =
              analysisResult.source !== "semantic" &&
              outcome?.jobId === analysisResult.jobId &&
              outcome.candidateId === candidateId
                ? outcome
                : undefined;
            const exportUrl = currentOutcome?.exportUrl ?? candidate.bvhUrl;
            const handOwner = useInstallationStore.getState().credentials?.installationId ?? "";
            const handSelection = qc.getQueryData<HandSelection>(
              handKeys.selection(handOwner, analysisResult.jobId, personIndex),
            );
            let content: Uint8Array;
            let downloadPath = "";
            if (analysisResult.capabilities.bodyPreviews && format === "fbx") {
              if (options.forceDefaultCharacter) throw new ApiError(409, "BODY_PREVIEW_STALE", "");
              const owner = useInstallationStore.getState().credentials?.installationId ?? "";
              const body = qc.getQueryData<BodySelection>(
                bodyKeys.selection(owner, analysisResult.jobId, personIndex),
              );
              const receipts = qc.getQueriesData<BodyReview>({
                queryKey: [...bodyKeys.person(owner, analysisResult.jobId, personIndex), "review"],
              });
              const receipt = receipts
                .map(([, r]) => r)
                .find(
                  (r) =>
                    r?.candidateId === candidateId &&
                    r.exportUrl === exportUrl &&
                    r.scope === scope &&
                    r.selection.selectionRevision === body?.selectionRevision &&
                    r.selection.resolvedBody?.assetSha256 === body?.resolvedBody?.assetSha256 &&
                    (handApplicable
                      ? !!handSelection &&
                        r.hands?.revision === handSelection.revision &&
                        r.hands.librarySha256 === handSelection.library_sha256
                      : !r.hands),
                );
              if (!owner || !receipt || body?.resolutionStatus !== "ready")
                throw new ApiError(409, "BODY_REVIEW_REQUIRED", "");
              content = await downloadBodyReview(receipt, controller.signal);
              downloadPath = receipt.downloadUrl;
              bodyNames.add(receipt.selection.resolvedBody!.characterId);
            } else if (handApplicable && format === "fbx") {
              const receipts = qc.getQueriesData<{ handReceipt?: HandReview }>({
                queryKey: ["framed-preview", handOwner],
              });
              const receipt = receipts
                .map(([, data]) => data?.handReceipt)
                .find((r) => {
                  if (
                    !r ||
                    !handSelection ||
                    r.revision !== handSelection.revision ||
                    r.librarySha256 !== handSelection.library_sha256
                  )
                    return false;
                  const params = new URL(r.downloadUrl, "https://standin.invalid").searchParams;
                  return (
                    params.get("jobId") === analysisResult.jobId &&
                    params.get("personIndex") === String(personIndex) &&
                    params.get("candidateId") === candidateId &&
                    params.get("outputScope") === scope &&
                    params.get("characterId") ===
                      (characterFor(personIndex) ?? catalog?.defaultCharacterId)
                  );
                });
              if (!receipt) throw new ApiError(409, "HAND_REVIEW_REQUIRED", "");
              content = await downloadHandReview(receipt, controller.signal);
              downloadPath = receipt.downloadUrl;
            } else {
              content = await resolvePoseBytes(
                exportUrl,
                candidateId,
                format,
                characterFor(personIndex),
                analysisResult.capabilities.outputScopeCropping === true ? scope : undefined,
                analysisResult.capabilities.modelPreview === true,
                currentOutcome?.refined === true,
                (path) => {
                  downloadPath = path;
                },
                controller.signal,
              ).catch((error) => {
                // Returning to review must fetch fresh lineage after a rejected save.
                void queryClient.invalidateQueries({ queryKey: ["framed-preview"] });
                throw error;
              });
            }
            return {
              fileName: personFileName(name, personIndex, picks.length),
              content,
              personIndex,
              candidateId,
              downloadPath,
            };
          }),
        );
        controller.signal.throwIfAborted();
        let saveFiles: { fileName: string; content: Uint8Array; sceneMetadata?: string }[] = files;
        let sceneBinding: string | undefined;
        let sceneMetadata: SceneManifest | undefined;
        if (
          format === "fbx" &&
          analysisResult.source !== "semantic" &&
          sceneSelectionAvailable(analysisResult, selectionState.selectedByPerson) &&
          !env.useMockPoseApi
        ) {
          sceneRequest = true;
          if (files.some((f) => !f.downloadPath))
            throw new Error("장면에 사용할 최종 파일을 확인하지 못했습니다.");
          const references = await Promise.all(
            files.map((f) =>
              sceneReference(f.personIndex, f.candidateId, f.downloadPath, f.content),
            ),
          );
          setSelectedSceneImages(
            Object.fromEntries(
              files.map((f) => [
                f.personIndex,
                qc.getQueryData<{ image: string }>([
                  "framed-image",
                  useInstallationStore.getState().credentials?.installationId ?? "",
                  f.downloadPath,
                ])?.image ?? "",
              ]),
            ),
          );
          const contract = analysisResult.capabilities.sceneSaveContract;
          const mode = options.sceneMode ?? sceneMode;
          if (contract && !contract.saveModes.includes(mode))
            throw new ApiError(409, "SCENE_CONTRACT_UNSUPPORTED", "");
          let review: SceneReview | undefined;
          let originalReceipt: OriginalSceneReceipt | undefined;
          const hasManifest = contract?.manifestVersion === SCENE_MANIFEST_VERSION;
          if (
            hasManifest &&
            analysisResult.capabilities.sceneAvailability?.manifest.available !== true
          )
            throw new ApiError(503, "SCENE_UNAVAILABLE", "");
          const excluded = Object.keys(selectionState.excludedPeople).map(Number);
          const validateMetadata = (manifest: unknown, digest: string) =>
            validateSceneManifest(manifest, {
              jobId: analysisResult.jobId,
              mode,
              sha256: digest,
              references,
              detected: analysisResult.people.map((p) => p.index),
              excluded,
              noCandidates: analysisResult.people
                .filter((p) => p.candidates.length === 0)
                .map((p) => p.index),
              sourceImage: analysisResult.sourceImage,
            });
          if (mode === "original-selection" && hasManifest) {
            originalReceipt = await prepareOriginalScene(
              analysisResult.jobId,
              references,
              excluded,
              controller.signal,
            );
            sceneMetadata = validateMetadata(
              originalReceipt.manifest,
              originalReceipt.artifactSha256,
            );
          }
          if (mode === "auto-correct-v4") {
            if (!contract || analysisResult.capabilities.sceneRefinement !== true)
              throw new ApiError(409, "SCENE_CONTRACT_UNSUPPORTED", "");
            review = await prepareScene(
              analysisResult.jobId,
              references,
              controller.signal,
              hasManifest ? excluded : undefined,
            );
            if (hasManifest)
              sceneMetadata = validateMetadata(review.manifest, review.artifactSha256);
            controller.signal.throwIfAborted();
            if (!sceneMounted.current) throw new ExportError("CANCELLED", "");
            telemetryPhase = "confirmation";
            const accepted = await new Promise<boolean>((resolve) => {
              sceneDecision.current = resolve;
              setPhase("awaiting-confirm");
              setSceneReview(review!);
              expiryTimer = setTimeout(
                () => {
                  controller.abort(new ApiError(409, "SCENE_REVIEW_EXPIRED", ""));
                  sceneDecision.current = null;
                  scenePreviewController.current?.abort();
                  setSceneReview(null);
                  resolve(false);
                },
                Math.max(0, Date.parse(review!.expiresAt) - Date.now()),
              );
              if (!review!.previewBase64) {
                const previewController = new AbortController();
                scenePreviewController.current = previewController;
                void loadScenePreview(
                  analysisResult.jobId,
                  references,
                  review!,
                  previewController.signal,
                )
                  .then((previewBase64) => {
                    if (!previewController.signal.aborted)
                      setSceneReview((current) =>
                        current?.reviewKey === review!.reviewKey
                          ? { ...current, previewBase64 }
                          : current,
                      );
                  })
                  .catch((error) => {
                    if (previewController.signal.aborted) return;
                    // Rendering is optional; rejected review/selection identity is not.
                    if (
                      error instanceof ApiError &&
                      ([
                        "SCENE_REVIEW_REQUIRED",
                        "SCENE_REVIEW_EXPIRED",
                        "SCENE_SOURCE_CHANGED",
                        "SCENE_CONTRACT_UNSUPPORTED",
                        "SCENE_INTEGRITY",
                      ].includes(error.code) ||
                        poseRecovery(error).action !== "retry" ||
                        error.status === 401 ||
                        error.status === 403)
                    ) {
                      controller.abort(error);
                      sceneDecision.current = null;
                      setSceneReview(null);
                      resolve(false);
                      return;
                    }
                    setSceneReview((current) =>
                      current?.reviewKey === review!.reviewKey
                        ? { ...current, previewFailed: true }
                        : current,
                    );
                  });
              }
            });
            clearTimeout(expiryTimer);
            controller.signal.throwIfAborted();
            if (!accepted) throw new ExportError("CANCELLED", "");
          }
          controller.signal.throwIfAborted();
          startSaving();
          const content = await downloadScene(
            analysisResult.jobId,
            references,
            review ?? originalReceipt,
            {
              signal: controller.signal,
              negotiated: !!contract,
            },
          );
          if (
            sceneMetadata &&
            (await sceneReference(0, "scene", "/", content)).sha256 !==
              sceneMetadata.artifact.sha256
          )
            throw new ApiError(502, "SCENE_INTEGRITY", "");
          sceneBinding = JSON.stringify([
            downloadBinding(format, files),
            mode,
            (await sceneReference(0, "scene", "/", content)).sha256,
          ]);
          saveFiles = [
            {
              fileName: name.replace(/\.fbx$/i, "_scene.fbx"),
              content,
              ...(sceneMetadata ? { sceneMetadata: JSON.stringify(sceneMetadata) } : {}),
            },
          ];
        }
        controller.signal.throwIfAborted();
        // A late response must never write an older selection to disk.
        if (
          snapshot() !== bindingAtStart ||
          qc.isMutating({ mutationKey: ["hand-change"] }) ||
          qc.isMutating({ mutationKey: ["body-change"] })
        )
          throw new ApiError(409, "PREVIEW_CHANGED", "");
        sceneRequest = false;
        const binding = sceneBinding ?? downloadBinding(format, files);
        const revision = downloadRevision(id, binding);
        startSaving();
        controller.signal.throwIfAborted();
        if (!sceneMounted.current) throw new ExportError("CANCELLED", "");
        // Native writes are atomic from the UI's perspective; HTTP cancellation ends here.
        writingFile.current = true;
        telemetryPhase = "writing";
        const writingStartedAt = Date.now();
        const results = await exportService.saveCandidates({
          folder: targetFolder,
          files: saveFiles.map((file) => ({
            ...file,
            fileName: revisionFileName(file.fileName, revision.ordinal),
          })),
        });
        // 사용자 기준 성공은 BFF의 BVH 응답이 아니라 로컬 파일 저장이다.
        // 서버 export_events만 보면 저장 단계 실패가 성공으로 집계된다.
        trackEvent(
          "export_completed",
          {
            ...(attempt ? attemptProperties(attempt) : {}),
            writingElapsedMs: Math.max(0, Date.now() - writingStartedAt),
            nativeDiskWrite: isTauri(),
            fileCount: results.length,
            format,
            // 인물마다 다를 수 있으므로 쓰인 값들을 모아 남긴다. 붙지 않은 경우
            // (기본 모델)는 "default"로 남긴다 — 빈 값과 구분해야 모델 선택이 실제로
            // 쓰이는지 지표에서 볼 수 있다.
            characterId: bodyNames.size
              ? [...bodyNames].join(",")
              : [...new Set(picks.map(([i]) => characterFor(Number(i)) ?? "default"))].join(","),
            surface: currentSurface(),
          },
          serverJob,
        );
        rememberDownload(id, binding);
        if (useExportStore.getState().jobId !== id) return;
        const paths = results.map((r) => r.path);
        if (options.append || useExportStore.getState().savedPaths.length > 0) addSaved(paths);
        else setSaved(paths);
      } catch (failure) {
        const cause = controller.signal.aborted ? controller.signal.reason : failure;
        const err =
          sceneRequest && !(cause instanceof ApiError) && !(cause instanceof ExportError)
            ? new ApiError(502, "SCENE_FAILED", "", undefined, {
                serverOperationMayContinue: isAppError(cause) && cause.kind === "network",
              })
            : cause;
        if (err instanceof ExportError && err.code === "CANCELLED") {
          if (attempt)
            trackEvent(
              "export_cancelled",
              { ...attemptProperties(attempt), phase: telemetryPhase },
              serverJob,
            );
          if (sceneMounted.current && useExportStore.getState().jobId === id) setPhase("cancelled");
          return;
        }
        if (
          (!sceneMounted.current && !writingFile.current) ||
          useExportStore.getState().jobId !== id
        )
          return;
        if (
          err instanceof ApiError &&
          (!err.code.startsWith("SCENE_") || err.code === "SCENE_SOURCE_CHANGED")
        )
          invalidateFinalReview(
            qc,
            qc.getQueryData<AnalysisResult>(poseQueryKeys.result(id))?.jobId ?? id,
          );
        if (
          err instanceof ApiError &&
          ["SCENE_REVIEW_REQUIRED", "SCENE_SOURCE_CHANGED"].includes(err.code)
        )
          qc.removeQueries({
            queryKey: [
              "prepared-scene",
              useInstallationStore.getState().credentials?.installationId ?? "",
              id,
            ],
          });
        const details = err instanceof ApiError ? err.details : undefined;
        setErrorAllowedActions(
          typeof details === "object" &&
            details !== null &&
            "allowedActions" in details &&
            Array.isArray(details.allowedActions)
            ? details.allowedActions.filter(
                (action): action is string => typeof action === "string",
              )
            : undefined,
        );
        setServerOperationMayContinue(
          typeof details === "object" &&
            details !== null &&
            "serverOperationMayContinue" in details &&
            details.serverOperationMayContinue === true,
        );
        setError(
          err instanceof ApiError
            ? toAppError(err).message
            : err instanceof ExportError
              ? err.message
              : "파일을 저장하지 못했어요. 저장 폴더를 확인한 뒤 다시 시도해 주세요.",
          err instanceof ApiError ? err.code : undefined,
        );
        trackEvent(
          "export_failed",
          {
            ...(attempt ? attemptProperties(attempt) : {}),
            ...failureProperties(cause, "export"),
            phase: telemetryPhase,
            code: err instanceof ExportError || err instanceof ApiError ? err.code : "UNKNOWN",
            format,
            surface: currentSurface(),
          },
          serverJob,
        );
      } finally {
        clearTimeout(expiryTimer);
        unsubscribe();
        unsubscribeQueries();
        unsubscribeOwner();
        writingFile.current = false;
        if (activeSave.current === controller) activeSave.current = undefined;
        settle();
      }
    },
    [startSaving, setPhase, setSaved, addSaved, setError, queryClient, sceneMode, preferredFormat],
  );

  /**
   * 자동 저장(ADR-009). 폴더와 파일 이름이 준비되면 한 번만 실행한다.
   *
   * StrictMode의 effect 이중 실행과 status 변화로 인한 재실행을 ref로 막는다. 재시도와
   * "다른 폴더에 저장"은 사용자 동작이므로 이 경로를 타지 않는다.
   */
  const autoSaveStarted = useRef<string>();
  useEffect(() => {
    if (autoSaveStarted.current === jobId) return;
    if (!folder || !fileName || !jobId || selectionCount === 0) return;
    if (status !== "idle" || (sceneContract && !modeChosen) || waitingForSaveConsent) return;
    autoSaveStarted.current = jobId;
    // A cancelled request from the previous job may still be settling.
    void saveSettled.current.then(() => {
      if (sceneMounted.current && latest.current.jobId === jobId)
        void runSave(folder, effectiveFormat);
    });
  }, [
    folder,
    fileName,
    jobId,
    selectionCount,
    status,
    runSave,
    effectiveFormat,
    sceneContract,
    modeChosen,
    waitingForSaveConsent,
  ]);

  async function saveOriginalSelection() {
    cancelSave();
    await saveSettled.current;
    if (!sceneMounted.current || latest.current.jobId !== jobId) return;
    setSceneChoice({ jobId, mode: "original-selection" });
    if (folder) await runSave(folder, effectiveFormat, { sceneMode: "original-selection" });
  }

  /** 저장 실패 후 같은 폴더·같은 포맷으로 다시 시도한다. */
  async function retry() {
    await saveSettled.current;
    if (!sceneMounted.current || latest.current.jobId !== jobId) return;
    if (folder) await runSave(folder, effectiveFormat);
  }

  /**
   * 이미 저장한 장면을 다른 포맷으로 한 번 더 저장한다(설정 기본값은 바꾸지 않는다).
   *
   * 작가가 클립스튜디오 버전 때문에 다른 포맷이 필요해지는 경우가 실제로 있다 — BVH는
   * 3.1.0 이상에서만 열린다. 그것 때문에 같은 컷을 다시 분석하게 만들 이유가 없다.
   */
  async function saveAlsoAs(format: ExportFormat) {
    if (folder) await runSave(folder, format, { append: true });
  }

  /**
   * 고른 체형을 서버가 만들지 못할 때(`CHARACTER_UNAVAILABLE`·converter 거부)의 복구 경로.
   * 이번 한 번만 기본 모델로 저장하고 설정값은 그대로 둔다 — 재시도로는 풀리지 않는
   * 실패에 사용자가 실제로 할 수 있는 유일한 일이다.
   */
  async function saveWithDefaultCharacter() {
    if (folder) await runSave(folder, effectiveFormat, { forceDefaultCharacter: true });
  }

  /**
   * 이번 한 번만 다른 폴더에 저장한다. 설정의 기본 저장 폴더는 바꾸지 않는다(ADR-009).
   * 기본 폴더를 바꾸려면 설정 화면으로 간다.
   */
  async function saveToAnotherFolder() {
    const serverJob = analysis?.jobId;
    const attempt = serverJob ? requestExport(serverJob, "choose_folder") : undefined;
    try {
      const picked = await exportService.chooseFolder(folder ?? undefined);
      if (picked) await runSave(picked, effectiveFormat);
      else if (attempt) {
        takeExportAttempt(serverJob!);
        trackEvent(
          "export_cancelled",
          { ...attemptProperties(attempt), phase: "folder" },
          serverJob,
        );
      }
    } catch (error) {
      if (attempt) {
        takeExportAttempt(serverJob!);
        trackEvent(
          "export_failed",
          {
            ...attemptProperties(attempt),
            ...failureProperties(error, "export"),
            phase: "folder",
            code: "FOLDER_DIALOG_FAILED",
          },
          serverJob,
        );
      }
      setError("저장 폴더를 열지 못했어요. 다시 시도해 주세요.");
    }
  }

  /** 설정 폴더가 사라졌을 때의 복구 경로. 기본값으로 되돌리고 그 폴더에 저장한다. */
  async function resetToDownloads() {
    const dir = await exportService.getDefaultFolder();
    setFolder(dir);
    clearError();
    await runSave(dir, effectiveFormat);
  }

  /** 저장을 마치고 새 장면을 시작한다. 목적지는 호출부가 정한다. */
  function newScene() {
    reset();
    clearSelection();
    clearDraft();
    autoSaveStarted.current = undefined;
  }

  function revealSaved() {
    if (savedPaths[0]) void exportService.revealInFolder(savedPaths[0]);
  }

  /** 클립스튜디오 임포트 대화상자에 붙여넣는 폴백 경로(docs/12 §3). */
  function copyPath(path: string): Promise<boolean> {
    return copyText(path);
  }

  return {
    coverage,
    needsPartialConfirmation,
    needsIndividualConfirmation,
    waitingForSaveConsent,
    sceneUnavailableReason: sceneUnavailableMessage(
      analysis?.capabilities.sceneAvailability?.originalSelection.reasons[0] ??
        (analysis?.capabilities.sceneSaveContract?.manifestVersion
          ? analysis.capabilities.sceneAvailability?.manifest.reasons[0]
          : undefined) ??
        (analysis?.capabilities.sceneExport && !isSceneExport
          ? "selected_artifact_unsupported"
          : undefined),
    ),
    confirmPartial: () => useExportStore.setState({ partialConsentBinding: consentBinding }),
    confirmIndividual: () => useExportStore.setState({ individualConsentBinding: consentBinding }),
    cancelSave,
    sceneMode,
    serverOperationMayContinue,
    sceneOutputLabel,
    choosingSceneMode,
    canAutoCorrect:
      sceneContract?.saveModes.includes("auto-correct-v4") === true &&
      analysis?.capabilities.sceneRefinement === true,
    canUseOriginal: sceneContract?.saveModes.includes("original-selection") === true,
    canUseOriginalAfterError:
      sceneContract?.saveModes.includes("original-selection") === true &&
      (errorAllowedActions
        ? errorAllowedActions.includes("use_original_selection")
        : poseRecovery(errorCode ? new ApiError(409, errorCode, "") : undefined).action ===
          "retry"),
    chooseSceneMode: (mode: SceneSaveMode) => {
      setSceneChoice({ jobId, mode });
    },
    saveOriginalSelection,
    comparison: {
      originalUrl:
        analysis?.inputPreviewUrl ?? (draft && draft.id === jobId ? draft.previewUrl : undefined),
      selected: selections.map(([index, candidateId]) => {
        const person = analysis?.people.find((p) => p.index === Number(index));
        const candidate = person?.candidates.find((c) => c.id === candidateId);
        return {
          personIndex: Number(index),
          candidateId,
          poseId: candidate?.poseId,
          image: selectedSceneImages[Number(index)],
          outputScope: previewScope(person),
        };
      }),
    },
    sceneReview,
    confirmScene: () => decideScene(true),
    cancelScene: () => decideScene(false),
    bodyMode,
    recovery: poseRecovery(errorCode ? new ApiError(409, errorCode, "") : undefined),
    returnToReview: () => {
      if (errorCode === "SCENE_CONTRACT_UNSUPPORTED")
        void queryClient.invalidateQueries({ queryKey: poseQueryKeys.result(jobId ?? "") });
      clearError();
    },
    errorCode,
    retryLabel: [
      "SCENE_REVIEW_REQUIRED",
      "SCENE_REVIEW_EXPIRED",
      "SCENE_TIMEOUT",
      "SCENE_INTEGRITY",
    ].includes(errorCode ?? "")
      ? "결과 다시 확인"
      : ["SCENE_UNAVAILABLE", "SCENE_BUSY", "SCENE_FAILED"].includes(errorCode ?? "")
        ? "잠시 후 다시 시도"
        : "다시 저장",
    folder,
    fileName,
    /** 실제로 저장에 쓰는 포맷. 설정값과 다를 수 있다(서버가 FBX를 못 줄 때). */
    format: effectiveFormat,
    formatDowngraded,
    serverSupportsFbx,
    /** 실제로 저장에 쓰인 체형 이름. 기본 모델로 내려갔으면 그 이름이다. */
    characterName,
    /** 사용자가 고른 체형 이름. 저장에 반영되지 않았어도 채워진다. */
    requestedCharacterName,
    /** 고른 체형을 못 쓴 이유. null이면 고른 대로 저장됐다. */
    characterDowngradeReason,
    /** 인물마다 다른 체형으로 저장했는가. 저장 화면이 문구를 고를 때 쓴다. */
    mixedCharacters,
    usesCustomCharacter,
    saveWithDefaultCharacter,
    saveAlsoAs,
    status,
    savedPaths,
    error,
    selections,
    isSaved,
    retry,
    saveToAnotherFolder,
    resetToDownloads,
    newScene,
    revealSaved,
    copyPath,
  };
}
