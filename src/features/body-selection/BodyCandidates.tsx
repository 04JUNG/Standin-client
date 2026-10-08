import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { apiFetchBlob } from "@/shared/api/client";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import type { PersonResult } from "@/features/pose-viewer/api/pose.contract";
import { useBodyControls, useBodyOwner, type BodyEntry } from "./hooks";
import { verifyDigest } from "./api";
import type { BodyOption } from "./contract";
const usePanels = create<{
  open: Record<string, boolean>;
  set: (key: string, value: boolean) => void;
}>((set) => ({
  open: {},
  set: (key, value) => set((s) => ({ open: { ...s.open, [key]: value } })),
}));
function NeutralCard({ option }: { option: BodyOption }) {
  const owner = useBodyOwner(),
    preview = option.neutralPreview;
  const query = useQuery({
    queryKey: ["body", owner, "neutral", preview],
    enabled: !!preview && preview.characterSha256 === option.bodyRef.assetSha256,
    queryFn: async ({ signal }) => {
      const blob = await apiFetchBlob(preview!.url, { auth: false, signal });
      if (blob.type !== "image/png") throw new Error("preview");
      await verifyDigest(await blob.arrayBuffer(), preview!.sha256);
      return blobToDataUrl(blob);
    },
    retry: false,
    staleTime: Infinity,
  });
  return (
    <div className="flex h-28 items-center justify-center rounded bg-surface-2">
      {query.data ? (
        <img src={query.data} className="h-full w-full object-contain" alt="" />
      ) : (
        <span className="p-2 text-center text-xs text-text-secondary">
          {preview && query.isPending ? "미리보기 준비 중" : "차렷 이미지 준비 중"}
        </span>
      )}
    </div>
  );
}
export function BodyCandidates({
  job,
  person,
  entry,
  selected,
  onSelect,
}: {
  job: string;
  person: PersonResult;
  entry?: BodyEntry;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const owner = useBodyOwner(),
    key = JSON.stringify([owner, job, person.index]);
  const open = usePanels((s) => s.open[key] === true),
    setOpen = usePanels((s) => s.set);
  const { options, mutation } = useBodyControls(job, person, entry?.selection);
  const catalog = useModelCatalog();
  const root = useRef<HTMLDivElement>(null),
    toggle = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);
  const selection = entry?.selection;
  const name = (id?: string) =>
    options.data?.characters.find((c) => c.characterId === id)?.displayName ??
    catalog.data?.characters.find((c) => c.characterId === id)?.displayName ??
    id ??
    "체형 확인 중";
  const ready = entry?.ready && !mutation.isPending;
  const source = selection?.resolvedSource;
  const label =
    source === "manual"
      ? "직접 선택"
      : source === "fixed_default"
        ? "내 기본 체형"
        : source === "auto_recommendation"
          ? "자동 추천"
          : "기본 체형 · 추천 불확실";
  function confirm() {
    if (!ready) return;
    setOpen(key, false);
    requestAnimationFrame(() => {
      const next = selected
        ? document.querySelector<HTMLButtonElement>("[data-body-next]")
        : root.current?.querySelector<HTMLButtonElement>("[data-pose-candidate]");
      if (next && !next.disabled) next.focus();
      else toggle.current?.focus();
    });
  }
  return (
    <div ref={root} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          {label} ·{" "}
          <strong className="text-text-primary">
            {name(selection?.resolvedBody?.characterId)}
          </strong>
        </p>
        <button
          ref={toggle}
          type="button"
          className="min-h-11 rounded px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-brand-sky"
          aria-expanded={open}
          aria-controls={"body-panel-" + person.index}
          onClick={() => setOpen(key, !open)}
        >
          체형 {open ? "접기" : "더보기"}
        </button>
      </div>
      {!ready && (
        <div aria-live="polite" className="rounded bg-surface-2 p-3 text-xs">
          {entry?.error ? (
            <>
              <p>체형 미리보기를 준비하지 못했습니다. 체형을 바꾸거나 다시 시도해 주세요.</p>
              <Button variant="ghost" onClick={() => void entry.retry()}>
                다시 시도
              </Button>
            </>
          ) : (
            "선택한 체형으로 포즈를 준비하고 있습니다…"
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {person.candidates.map((candidate) => (
          <PoseCandidateCard
            key={candidate.id}
            candidate={candidate}
            isSelected={candidate.id === selected}
            onSelect={() => onSelect(candidate.id)}
            bodyPreview={{
              url: ready ? entry?.group?.images[candidate.id] : undefined,
              pending: !ready,
            }}
          />
        ))}
      </div>
      {open && (
        <section
          ref={panel}
          id={"body-panel-" + person.index}
          aria-label={`인물 ${person.index + 1} 체형 선택`}
          className="flex max-h-[340px] flex-col rounded-xl border border-border bg-surface-1 p-3"
        >
          <p className="mb-2 text-xs text-text-secondary">
            이 인물의 체형만 바뀝니다. 선택한 포즈는 유지됩니다.
          </p>
          <div className="mb-3 flex gap-2">
            <Button
              variant="secondary"
              disabled={mutation.isPending || selection?.recommendation.status !== "available"}
              onClick={() => mutation.mutate({ intent: "auto" })}
            >
              자동 추천으로
            </Button>
            <Button
              variant="ghost"
              disabled={mutation.isPending || !selection}
              onClick={() => mutation.mutate({ intent: "inherit" })}
            >
              작업 기본값으로
            </Button>
          </div>
          {options.isError ? (
            <Button onClick={() => void options.refetch()}>체형 목록 다시 시도</Button>
          ) : options.isPending ? (
            <p role="status">체형 목록을 불러오는 중…</p>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {options.data.characters.map((option) => (
                <button
                  type="button"
                  key={option.characterId}
                  aria-pressed={selection?.resolvedBody?.characterId === option.characterId}
                  disabled={!option.selectable || mutation.isPending || !selection}
                  onClick={() =>
                    mutation.mutate({ intent: "manual", characterId: option.characterId })
                  }
                  className={`rounded-lg border-2 p-2 text-xs disabled:opacity-40 ${selection?.resolvedBody?.characterId === option.characterId ? "border-brand-coral" : "border-border"}`}
                >
                  <NeutralCard option={option} />
                  <span className="mt-2 block">{name(option.characterId)}</span>
                  {!option.selectable && <span className="block">현재 포즈에 사용 불가</span>}
                </button>
              ))}
            </div>
          )}
          {mutation.isError && (
            <p role="alert" className="mt-2 text-xs text-brand-coral">
              체형을 저장하지 못했습니다. 현재 선택을 확인한 뒤 다시 선택해 주세요.
            </p>
          )}
          <div className="mt-3 flex shrink-0 justify-end bg-surface-1 py-2">
            <Button disabled={!ready} onClick={confirm}>
              이 체형으로 확정
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
