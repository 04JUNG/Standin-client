import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Modal } from "@/shared/components/Modal";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { localLibraryKey, useLocalLibrary } from "./library";
import { LocalLibrary } from "./LocalLibrary";
import { localSelectionKey, useLocalBodies, useLocalImport } from "./store";
import { localBodyApi } from "./api";
import { LocalFbxPreview } from "./LocalFbxPreview";
import { localError, type LocalModel } from "./contract";

// Unmount offscreen renderers so a large library does not exhaust WebGL contexts.
function ModelPreview({ model }: { model: LocalModel }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={host} className="flex aspect-square w-full items-center justify-center">
      {visible && <LoadedModelPreview model={model} />}
    </span>
  );
}
function LoadedModelPreview({ model }: { model: LocalModel }) {
  const preview = useQuery({
    queryKey: ["personal-body-preview", model.localModelId, model.sourceHash, model.version],
    queryFn: () => localBodyApi.preview(model.localModelId, model.sourceHash),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
  if (preview.isError)
    return (
      <span role="status" className="p-3 text-center text-xs text-text-secondary">
        미리보기를 불러오지 못했어요.
      </span>
    );
  return <LocalFbxPreview content={preview.data} name={model.name} format="glb" />;
}
function IconButton({
  label,
  children,
  type = "button",
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?(): void;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
function LibraryCard({
  model,
  busy,
  onOpen,
  onRename,
  onDelete,
}: {
  model: LocalModel;
  busy: boolean;
  onOpen(): void;
  onRename(name: string): Promise<void>;
  onDelete(): void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  async function commit() {
    if (renaming === null) return;
    const next = renaming.trim();
    if (!next || [...next].length > 64) {
      setInvalid(true);
      return;
    }
    if (next !== model.name) {
      try {
        await onRename(next);
      } catch {
        return;
      }
    }
    setRenaming(null);
  }
  return (
    <div
      data-replay-private
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-3"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${model.name} 모습 확인`}
        className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky enabled:hover:ring-2 enabled:hover:ring-brand-sky/60"
      >
        <ModelPreview model={model} />
      </button>
      {renaming !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void commit();
          }}
        >
          <input
            autoFocus
            aria-label="카드 이름"
            aria-invalid={invalid || undefined}
            value={renaming}
            maxLength={64}
            disabled={busy}
            onChange={(e) => {
              setInvalid(false);
              setRenaming(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenaming(null);
            }}
            className={`h-8 min-w-0 flex-1 rounded-md border bg-surface-0 px-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky ${invalid ? "border-brand-coral" : "border-border"}`}
          />
          <IconButton type="submit" label="이름 저장" disabled={busy}>
            <Check className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="이름 변경 취소" disabled={busy} onClick={() => setRenaming(null)}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-text-primary">{model.name}</div>
            <div className="truncate text-[12px] text-text-secondary">
              {model.format.toUpperCase()} · 이 기기에 보관됨
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <IconButton
              label={`${model.name} 이름 변경`}
              disabled={busy}
              onClick={() => {
                setRenaming(model.name);
                setInvalid(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
            <IconButton label={`${model.name} 삭제`} disabled={busy} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
function SelectionCard({
  model,
  selected,
  onSelect,
  variant,
}: {
  model: LocalModel;
  selected: boolean;
  onSelect(): void;
  variant: "app" | "bar";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={model.name}
      onClick={onSelect}
      className={`relative flex shrink-0 snap-start flex-col gap-0.5 rounded-xl border-2 bg-surface-0 p-1 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand-sky ${selected ? "border-brand-coral" : "border-border hover:border-brand-sky"} ${variant === "bar" ? "w-[96px]" : "w-[140px]"}`}
    >
      {selected && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-brand-coral px-1.5 text-[10px] font-semibold text-white">
          선택됨
        </span>
      )}
      <span
        className={`flex w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2 ${variant === "bar" ? "h-[120px]" : "h-[196px]"}`}
      >
        <ModelPreview model={model} />
      </span>
      <strong className="w-full truncate px-1 text-xs">{model.name}</strong>
      <span className="px-1 text-[10px] text-text-secondary">이 기기에 보관됨</span>
    </button>
  );
}
/** Selection-only strip used by both app and floating bar. */
export function PersonalDeformCards({
  job,
  person,
  variant,
}: {
  job: string;
  person: number;
  variant: "app" | "bar";
}) {
  const query = useLocalLibrary();
  const key = localSelectionKey(job, person);
  const models = useLocalBodies((s) => s.models);
  const selected = useLocalBodies((s) => s.selected[key]);
  const strip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (strip.current) strip.current.scrollLeft = useLocalBodies.getState().scroll[key] ?? 0;
  }, [key, models.length]);
  return (
    <div data-replay-private>
      <div
        ref={strip}
        role="radiogroup"
        aria-label="내 데포르메"
        tabIndex={0}
        onScroll={(e) => useLocalBodies.getState().setScroll(key, e.currentTarget.scrollLeft)}
        className="horizontal-scroll flex min-w-0 snap-x gap-2 overflow-x-auto overflow-y-hidden pb-2"
      >
        {models.map((model) => (
          <SelectionCard
            key={model.localModelId}
            model={model}
            selected={selected === model.localModelId}
            variant={variant}
            onSelect={() => useLocalBodies.getState().select(key, model.localModelId)}
          />
        ))}
      </div>
      {query.isPending && (
        <p role="status" className="text-xs text-text-secondary">
          데포르메 카드를 불러오는 중…
        </p>
      )}
      {query.isError ? (
        <p role="alert" className="text-xs text-text-secondary">
          목록을 불러오지 못했어요.{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            다시 시도
          </button>
        </p>
      ) : (
        !query.isPending &&
        models.length === 0 && (
          <p className="text-xs text-text-secondary">
            체형 커스텀에서 데포르메를 불러오면 여기에 표시돼요.
          </p>
        )
      )}
    </div>
  );
}

/** Import and management are available only on the custom library page. */
export function PersonalDeformLibrary() {
  const qc = useQueryClient();
  const query = useLocalLibrary();
  const [viewId, setViewId] = useState<string>();
  const [deleting, setDeleting] = useState<LocalModel>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importing = useLocalImport((s) => !!s.jobId);
  const models = useLocalBodies((s) => s.models);
  const view = models.find((m) => m.localModelId === viewId);
  async function refresh() {
    const result = await query.refetch();
    if (result.isError) throw result.error;
    if (result.data) useLocalBodies.getState().setModels(result.data);
  }
  async function rename(model: LocalModel, name: string) {
    setBusy(true);
    setError("");
    try {
      await localBodyApi.rename(model.localModelId, name);
      const next = useLocalBodies
        .getState()
        .models.map((m) => (m.localModelId === model.localModelId ? { ...m, name } : m));
      qc.setQueryData(localLibraryKey, next);
      useLocalBodies.getState().setModels(next);
      await refresh();
    } catch (failure) {
      setError(localError(failure));
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-replay-private>
      <div aria-label="내 데포르메 카드" className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <LocalLibrary />
        {models.map((model) => (
          <LibraryCard
            key={model.localModelId}
            model={model}
            busy={busy || importing}
            onOpen={() => setViewId(model.localModelId)}
            onRename={(name) => rename(model, name)}
            onDelete={() => {
              setError("");
              setDeleting(model);
            }}
          />
        ))}
      </div>

      {!query.isPending && !query.isError && models.length === 0 && (
        <p className="text-sm text-text-secondary">아직 불러온 데포르메가 없어요.</p>
      )}
      {(error || query.isError) && (
        <p role="alert" className="mt-2 text-[12px] text-brand-coral">
          {error || "목록을 불러오지 못했어요."}
          {query.isError && (
            <button
              type="button"
              className="ml-1 underline"
              onClick={() => void refresh().catch(() => {})}
            >
              다시 시도
            </button>
          )}
        </p>
      )}
      <Modal
        privateContent
        open={!!view}
        title={view?.name ?? "내 데포르메"}
        onClose={() => setViewId(undefined)}
      >
        {view && (
          <div className="mx-auto max-w-[320px]">
            <ModelPreview model={view} />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        privateContent
        open={!!deleting}
        loading={busy}
        destructive
        title="데포르메 카드를 삭제할까요?"
        description={
          deleting ? `‘${deleting.name}’ 카드를 지웁니다. 따로 저장한 FBX는 그대로 남아요.` : ""
        }
        confirmLabel="삭제"
        onCancel={() => {
          if (!busy) setDeleting(undefined);
        }}
        onConfirm={() => {
          if (!deleting || busy) return;
          setBusy(true);
          setError("");
          void localBodyApi
            .remove(deleting.localModelId)
            .then(() => {
              const state = useLocalBodies.getState();
              const next = state.models.filter((m) => m.localModelId !== deleting.localModelId);
              qc.setQueryData(localLibraryKey, next);
              state.setModels(next);
              if (viewId === deleting.localModelId) setViewId(undefined);
              setDeleting(undefined);
              return refresh();
            })
            .catch((failure) => setError(localError(failure)))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
