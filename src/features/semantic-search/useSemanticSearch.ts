import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useModelStore } from "@/features/models/store/modelStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { poseService } from "@/features/pose-viewer/api/pose.service";
import { poseQueryKeys } from "@/features/pose-viewer/queryKeys";
import { searchCapabilities, searchPoses } from "./api";

/** Text search only. Prefetch the full result before navigation to keep the input mounted. */
export function useSemanticSearch(
  initialQuery = "",
  surface: "app" | "bar" = "app",
  resultKey?: string,
) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState(initialQuery.slice(0, 500));
  const [revision, setRevision] = useState(0);
  const [composing, setComposing] = useState(false);
  const [noResult, setNoResult] = useState(false);
  const generation = useRef(0);
  const consumedRevision = useRef(0);
  const controller = useRef<AbortController>();
  const activeText = useRef<string>();
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const availability = useQuery({
    queryKey: ["semantic-capabilities", owner],
    queryFn: ({ signal }) => searchCapabilities(signal),
    retry: false,
    staleTime: 30_000,
  });
  const { mutate, reset, ...search } = useMutation({
    mutationFn: async ({
      text,
      signal,
    }: {
      text: string;
      signal: AbortSignal;
      generation: number;
      owner: string | undefined;
    }) => {
      const response = await searchPoses(text, signal, null);
      signal.throwIfAborted();
      if (response.status === "no_result") return { response, result: undefined };
      const result = await poseService.loadResult({ jobId: response.jobId, signal });
      signal.throwIfAborted();
      return { response, result };
    },
    onSuccess: ({ response, result }, variables) => {
      if (
        variables.generation !== generation.current ||
        variables.signal.aborted ||
        variables.owner !== useInstallationStore.getState().credentials?.installationId
      )
        return;
      activeText.current = undefined;
      if (!result || response.status !== "ok") {
        setNoResult(true);
        return;
      }
      qc.setQueryData(poseQueryKeys.result(response.jobId), result);
      usePoseSelectionStore
        .getState()
        .startJob(response.jobId, useModelStore.getState().preferredCharacterId);
      navigate(surface === "bar" ? "/bar/candidates" : `/app/jobs/${response.jobId}`);
    },
    onSettled: (_data, _error, variables) => {
      if (variables.generation === generation.current) activeText.current = undefined;
    },
    retry: false,
  });
  const displayed = useRef({ resultKey, initialQuery });
  useLayoutEffect(() => {
    if (
      displayed.current.resultKey === resultKey &&
      displayed.current.initialQuery === initialQuery
    )
      return;
    displayed.current = { resultKey, initialQuery };
    generation.current++;
    controller.current?.abort();
    activeText.current = undefined;
    consumedRevision.current = 0;
    reset();
    setQuery(initialQuery.slice(0, 500));
    setRevision(0);
    setComposing(false);
    setNoResult(false);
  }, [initialQuery, resultKey, reset]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [owner],
  );
  function edit(text: string) {
    generation.current++;
    controller.current?.abort();
    activeText.current = undefined;
    reset();
    setNoResult(false);
    setQuery(text);
    setRevision((r) => r + 1);
  }
  const ready = availability.data?.available === true && availability.data.supportsAllResults;
  const submit = useCallback(() => {
    const text = query.trim();
    if (!text || text.length > 500 || !ready || composing || activeText.current === text) return;
    consumedRevision.current = revision;
    controller.current?.abort();
    controller.current = new AbortController();
    generation.current++;
    activeText.current = text;
    setNoResult(false);
    mutate({ text, signal: controller.current.signal, generation: generation.current, owner });
  }, [query, ready, composing, revision, mutate, owner]);
  useEffect(() => {
    if (!revision || revision === consumedRevision.current || composing || !ready || !query.trim())
      return;
    const timer = window.setTimeout(() => {
      if (consumedRevision.current !== revision) submit();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [revision, composing, ready, query, submit]);
  const pending = search.isPending && search.variables?.generation === generation.current;
  return {
    query,
    edit,
    submit,
    pending,
    noResult,
    availability,
    search,
    composing,
    setComposing,
    ready,
  };
}
