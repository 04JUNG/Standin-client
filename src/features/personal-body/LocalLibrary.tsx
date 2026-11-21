import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { localLibraryKey, useLocalLibrary } from "./library";
import { localBodyApi } from "./api";
import { localError } from "./contract";
import { useLocalBodies, useLocalImport } from "./store";

const stageLabels: Record<string, string> = {
  inspect: "데포르메를 확인하고 있어요.",
  copying: "선택한 파일을 기기에 보관하고 있어요.",
  inspecting: "데포르메를 확인하고 있어요.",
  retargeting: "포즈를 적용하고 있어요.",
  validating: "파일을 확인하고 있어요.",
  committing: "파일을 보관하고 있어요.",
  import: "파일을 준비하고 있어요.",
  export: "저장할 파일을 확인하고 있어요.",
};

/** Import entry on the custom library page. Existing cards own their management actions. */
export function LocalLibrary({ openInitially = false }: { openInitially?: boolean }) {
  const library = useLocalLibrary();
  const qc = useQueryClient();
  const capability = useQuery({
    queryKey: ["personal-body-capability"],
    queryFn: localBodyApi.capabilities,
    staleTime: 300_000,
    retry: false,
  });
  const [open, setOpen] = useState(openInitially);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const jobId = useLocalImport((s) => s.jobId);
  const stage = useLocalImport((s) => s.stage);
  const importError = useLocalImport((s) => s.error);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let disposed = false;
    if (localBodyApi.supported())
      void localBodyApi
        .progress((event) => {
          if (event.jobId === useLocalImport.getState().jobId)
            useLocalImport.setState({
              stage: stageLabels[event.stage] ?? "파일을 준비하고 있어요.",
            });
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else stop = unlisten;
        })
        .catch(() => {
          /* Native command still reports import failures. */
        });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  async function importFile() {
    if (useLocalImport.getState().jobId) return;
    const models = useLocalBodies.getState().models;
    const id = crypto.randomUUID();
    setError("");
    useLocalImport.setState({ jobId: id, error: "", stage: "데포르메 파일을 골라 주세요." });
    try {
      const model = await localBodyApi.import(id, name.trim() || "내 데포르메");
      const refreshed = await library.refetch();
      if (refreshed.isError) {
        if (model) {
          const current = useLocalBodies.getState().models;
          const next = [...current.filter((m) => m.localModelId !== model.localModelId), model];
          qc.setQueryData(localLibraryKey, next);
          useLocalBodies.getState().setModels(next);
        }
        throw { code: "LIBRARY_REFRESH_FAILED" };
      }
      if (refreshed.data) useLocalBodies.getState().setModels(refreshed.data);
      useLocalImport.setState({
        stage: !model
          ? "파일 선택을 취소했어요."
          : models.some(
                (m) =>
                  m.localModelId === model.localModelId &&
                  m.sourceHash === model.sourceHash &&
                  m.version === model.version &&
                  m.converterFingerprint === model.converterFingerprint,
              )
            ? "이미 등록한 파일이에요. 기존 카드를 사용할 수 있어요."
            : "데포르메를 불러왔어요. 내 데포르메 탭에서 확인해 주세요.",
      });
      if (model && mounted.current) setName("");
    } catch (failure) {
      useLocalImport.setState({ stage: "", error: localError(failure) });
    } finally {
      useLocalImport.setState({ jobId: undefined });
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={jobId ? "데포르메 준비 중 · 확인" : "내 데포르메 불러오기"}
        className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-0 p-3 text-center transition-colors hover:border-brand-coral hover:text-brand-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
      >
        <Plus className="h-10 w-10" aria-hidden />
        <span className="text-[14px] font-semibold">
          {jobId ? "데포르메 준비 중 · 확인" : "내 데포르메 불러오기"}
        </span>
        <span className="text-[12px] text-text-secondary">FBX·CS3C 파일을 카드로 보관해요</span>
      </button>
      <Modal
        privateContent
        open={open}
        title="내 데포르메 불러오기"
        width="lg"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>FBX·CS3C 파일을 불러와 이 기기에 보관해요.</p>
          <label className="block">
            카드 이름
            <input
              maxLength={64}
              value={name}
              disabled={!!jobId}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-surface-0 px-3"
            />
          </label>
          <Button
            disabled={!capability.data?.available || !!jobId}
            onClick={() => void importFile()}
          >
            FBX·CS3C 파일 선택
          </Button>
          {capability.isPending && <p role="status">불러오기 기능을 확인하는 중…</p>}
          {capability.isError && (
            <p role="alert">
              불러오기 기능을 확인하지 못했어요.{" "}
              <button type="button" className="underline" onClick={() => void capability.refetch()}>
                다시 시도
              </button>
            </p>
          )}
          {!capability.isPending && !capability.isError && !capability.data?.available && (
            <p role="status">
              {localBodyApi.supported()
                ? "이 앱에는 데포르메 준비 기능이 아직 포함되지 않았어요. 앱 업데이트를 확인해 주세요."
                : "설치한 데스크톱 앱에서 파일을 등록할 수 있어요."}
            </p>
          )}
          {capability.data?.available && !capability.data.formats.includes("cs3c") && (
            <p className="text-xs text-text-secondary">
              이 버전은 FBX만 준비할 수 있어요. CS3C 파일은 지원하는 앱 버전에서 불러올 수 있어요.
            </p>
          )}
          {jobId && (
            <div role="status">
              {stage}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void localBodyApi.cancel(jobId).catch((failure) => setError(localError(failure)))
                }
              >
                취소
              </Button>
            </div>
          )}
          {!jobId && stage && <p role="status">{stage}</p>}
          {(error || importError) && (
            <p role="alert" className="text-brand-coral">
              {error || importError}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
