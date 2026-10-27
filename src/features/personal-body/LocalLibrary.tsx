import { useLocalLibrary } from "./library";
import { LocalFbxPreview } from "./LocalFbxPreview";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { localBodyApi } from "./api";
import { localError, type LocalModel } from "./contract";
import { localSelectionKey, useLocalBodies, useLocalImport } from "./store";

const stageLabels: Record<string, string> = {
  inspect: "체형을 확인하고 있어요.",
  copying: "선택한 파일을 기기에 보관하고 있어요.",
  inspecting: "체형을 확인하고 있어요.",
  retargeting: "체형에 포즈를 적용하고 있어요.",
  validating: "저장할 파일을 확인하고 있어요.",
  committing: "체형을 기기에 보관하고 있어요.",
  import: "사용할 체형을 준비하고 있어요.",
  export: "저장할 파일을 확인하고 있어요.",
};
export function LocalLibrary({
  job,
  person,
  openInitially = false,
}: {
  job?: string;
  person?: number;
  openInitially?: boolean;
}) {
  const library = useLocalLibrary();
  const capability = useQuery({
    queryKey: ["personal-body-capability"],
    queryFn: localBodyApi.capabilities,
    staleTime: 300_000,
    retry: false,
  });
  const models = useLocalBodies((s) => s.models);
  const selected = useLocalBodies((s) => s.selected);
  const select = useLocalBodies((s) => s.select);
  const setScroll = useLocalBodies((s) => s.setScroll);
  const key =
    job !== undefined && person !== undefined ? localSelectionKey(job, person) : "library";
  const [open, setOpen] = useState(openInitially);
  const [name, setName] = useState("");
  const jobId = useLocalImport((s) => s.jobId);
  const stage = useLocalImport((s) => s.stage);
  const importError = useLocalImport((s) => s.error);
  const setStage = (stage: string) => useLocalImport.setState({ stage });
  const setJobId = (jobId?: string) => useLocalImport.setState({ jobId });
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<LocalModel>();
  const [editing, setEditing] = useState<string>();
  const [previewId, setPreviewId] = useState<string>();
  const previewModel = models.find((m) => m.localModelId === previewId);
  const preview = useQuery({
    queryKey: [
      "personal-body-preview",
      previewModel?.localModelId,
      previewModel?.sourceHash,
      previewModel?.version,
    ],
    queryFn: () => localBodyApi.preview(previewModel!.localModelId, previewModel!.sourceHash),
    enabled: !!previewModel && open,
    retry: false,
    staleTime: 300_000,
  });
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const strip = useRef<HTMLDivElement>(null);
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
              stage: stageLabels[event.stage] ?? "사용할 체형을 준비하고 있어요.",
            });
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else stop = unlisten;
        });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = useLocalBodies.getState().scroll[key] ?? 0;
  }, [key, models.length]);
  async function importFile(replaceId?: string) {
    if (busy || useLocalImport.getState().jobId) return;
    const id = crypto.randomUUID();
    setJobId(id);
    setError("");
    useLocalImport.setState({ error: "" });
    setStage("체형 파일을 골라 주세요.");
    try {
      const model = await localBodyApi.import(id, name.trim() || "내 체형", replaceId);
      await library.refetch();
      if (!model) setStage("파일 선택을 취소했어요.");
      if (model) {
        setStage(
          models.some(
            (m) =>
              m.localModelId === model.localModelId &&
              m.sourceHash === model.sourceHash &&
              m.version === model.version &&
              m.converterFingerprint === model.converterFingerprint,
          )
            ? "이미 등록한 파일이에요. 기존 카드를 사용할 수 있어요."
            : "체형을 등록했어요.",
        );
        if (mounted.current) {
          setName("");
          setPreviewId(model.localModelId);
        }
      }
    } catch (failure) {
      useLocalImport.setState({ stage: "", error: localError(failure) });
    } finally {
      setJobId(undefined);
    }
  }
  async function rename(model: LocalModel) {
    if (!name.trim()) {
      setError("카드 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await localBodyApi.rename(model.localModelId, name.trim());
      await library.refetch();
      setEditing(undefined);
      setName("");
    } catch (failure) {
      setError(localError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {jobId ? "체형 준비 중 · 확인" : "파일로 체형 등록"}
      </Button>
      {job && (
        <div
          ref={strip}
          onScroll={(event) => setScroll(key, event.currentTarget.scrollLeft)}
          className="horizontal-scroll flex gap-2 overflow-x-auto py-1"
          role="group"
          aria-label="이 기기의 내 체형"
        >
          {models.map((model) => (
            <button
              key={model.localModelId}
              type="button"
              aria-pressed={selected[key] === model.localModelId}
              onClick={() => select(key, model.localModelId)}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-left text-xs hover:border-brand-sky focus-visible:ring-2 focus-visible:ring-brand-sky"
            >
              <strong>
                {model.name}
                {selected[key] === model.localModelId ? " · 선택됨" : ""}
              </strong>
              <span className="block">
                {model.format.toUpperCase()} · 버전 {model.version}
              </span>
              <span className="block">
                {model.capabilities.leftHand && model.capabilities.rightHand
                  ? "몸·손 사용 가능"
                  : "몸 사용 가능 · 손 변경 제한"}
              </span>
            </button>
          ))}
          {selected[key] && (
            <Button variant="ghost" size="sm" onClick={() => select(key)}>
              기본 체형으로 돌아가기
            </Button>
          )}
        </div>
      )}
      <Modal
        open={open}
        title="파일로 체형 등록"
        width="lg"
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="space-y-3 text-sm">
          <p>FBX·CS3C 파일을 이 기기에 보관해요. 파일마다 사용할 수 있는 범위를 확인해요.</p>
          <label className="block">
            카드 이름
            <input
              maxLength={64}
              value={name}
              disabled={!!jobId || busy}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-surface-0 px-3"
            />
          </label>
          <Button
            disabled={!capability.data?.available || !!jobId || busy}
            onClick={() => void importFile()}
          >
            FBX·CS3C 파일 선택
          </Button>
          {!capability.data?.available && (
            <p role="status">
              {localBodyApi.supported()
                ? "이 앱에는 체형 준비 기능이 아직 포함되지 않았어요. 앱 업데이트를 확인해 주세요."
                : "설치한 데스크톱 앱에서 파일을 등록할 수 있어요."}
            </p>
          )}
          {capability.data?.available && !capability.data.formats.includes("cs3c") && (
            <p className="text-xs text-text-secondary">
              이 버전은 FBX만 준비할 수 있어요. CS3C 지원은 준비 중이에요.
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
          {library.isError && (
            <p role="alert">
              기기에 저장한 목록을 불러오지 못했어요.{" "}
              <button className="underline" onClick={() => void library.refetch()}>
                다시 시도
              </button>
            </p>
          )}
          {previewModel && (
            <div className="mx-auto max-w-[260px]">
              <strong>{previewModel.name}</strong>
              <LocalFbxPreview content={preview.data} name={previewModel.name} format="glb" />
              {preview.error && (
                <p role="status" className="text-xs">
                  체형 미리보기를 불러오지 못했어요. 포즈 적용과 파일 저장은 다시 시도할 수 있어요.
                </p>
              )}
              <p className="text-xs">
                기본 자세와 방향을 확인해 주세요. 실제 크기는 저장한 파일을 사용하는 도구에서 확인해
                주세요.
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {models.map((model) => (
              <li key={model.localModelId} className="rounded-lg border border-border p-3">
                <strong>{model.name}</strong>
                <p className="text-xs">
                  {model.format.toUpperCase()} · 버전 {model.version} · 이 기기에 보관됨
                </p>
                <p className="text-xs">
                  {!model.capabilities.leftHand && !model.capabilities.rightHand
                    ? "이 체형은 손 모양을 바꿀 수 없어요."
                    : !model.capabilities.leftHand
                      ? "왼손 모양은 바꿀 수 없어요."
                      : !model.capabilities.rightHand
                        ? "오른손 모양은 바꿀 수 없어요."
                        : "몸 포즈와 손 모양을 바꿀 수 있어요."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewId(model.localModelId)}
                  >
                    모습 확인
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!jobId || busy}
                    onClick={() => {
                      setEditing(model.localModelId);
                      setName(model.name);
                    }}
                  >
                    이름 변경
                  </Button>
                  {editing === model.localModelId && (
                    <Button size="sm" disabled={busy} onClick={() => void rename(model)}>
                      이름 저장
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!jobId || busy || !capability.data?.available}
                    onClick={() => void importFile(model.localModelId)}
                  >
                    파일 교체
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!jobId || busy}
                    onClick={() => setDeleting(model)}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        loading={busy}
        destructive
        title="기기에서 체형 삭제"
        description="등록한 원본 사본과 준비한 파일을 지워요. 따로 저장한 FBX는 그대로 남아요."
        confirmLabel="삭제"
        onConfirm={() => {
          if (!deleting || busy) return;
          setBusy(true);
          void localBodyApi
            .remove(deleting.localModelId)
            .then(() => library.refetch())
            .then(() => setDeleting(undefined))
            .catch((failure) => setError(localError(failure)))
            .finally(() => setBusy(false));
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}
