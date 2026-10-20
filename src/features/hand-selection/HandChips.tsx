import { messageOf } from "@/shared/api/errors";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { HandThumbnail } from "./HandThumbnail";
import { handThumbnailKeys } from "./thumbnail";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { HandsState } from "./hooks";
import { sides, type Side, type HandPreset } from "./contract";
const labels = { left: "왼손", right: "오른손" };
export function HandChips({
  state,
  personIndex,
  compact = false,
}: {
  state: HandsState;
  personIndex: number;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [side, setSide] = useState<Side | null>(null);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  if (!state.enabled) return null;
  const entry = state.entries.find((e) => e.personIndex === personIndex);
  if (!entry) return null;
  if (entry.error)
    return (
      <div role="alert" className="p-2 text-[12px] text-brand-coral">
        손 선택을 불러오지 못했습니다.{" "}
        <button className="underline" onClick={() => void entry.retry()}>
          다시 시도
        </button>
      </div>
    );
  const selection = entry.selection,
    catalog = state.catalog;
  if (!selection || !catalog)
    return (
      <p role="status" className="p-2 text-[12px] text-text-secondary">
        손 선택을 불러오는 중…
      </p>
    );
  const presets = catalog.categories.flatMap((c) => c.presets);
  const byId = new Map(presets.map((p) => [p.id, p]));
  const status = (s: Side) =>
    selection.changed.includes(s)
      ? "고른 손 모양"
      : selection.observation[s].source === "vlm"
        ? selection.observation[s].confidence === "low"
          ? "확인 필요"
          : "추천"
        : selection.observation[s].visible === false
          ? "기본 · 러프에서 안 보임"
          : "기본";
  const filter = query.trim().toLocaleLowerCase();
  const displayed = (
    filter
      ? presets
      : category === "all"
        ? presets
        : (catalog.categories.find((c) => c.id === category)?.presets ??
          catalog.categories[0]?.presets ??
          [])
  ).filter((p) => !filter || `${p.label} ${p.description}`.toLocaleLowerCase().includes(filter));
  const select = (id: string) => {
    if (side && !state.pending) state.change(selection, { [side]: id });
  };
  const tile = (p: HandPreset) => (
    <button
      type="button"
      key={p.id}
      aria-label={p.label}
      disabled={state.pending}
      aria-pressed={!!side && selection[side] === p.id}
      onClick={() => select(p.id)}
      className={`flex min-h-[136px] flex-col items-center justify-center gap-1 rounded-lg border p-2 text-[12px] text-text-primary hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-sky disabled:opacity-50 ${side && selection[side] === p.id ? "border-brand-coral bg-surface-2" : "border-border"}`}
    >
      {side && <HandThumbnail preset={p} side={side} librarySha={catalog.library_sha256} large />}
      <span>{p.label}</span>
    </button>
  );
  return (
    <section
      aria-label={`인물 ${personIndex + 1} 손 선택`}
      className={`flex flex-col gap-2 border-t border-border ${compact ? "p-2" : "p-3"}`}
    >
      <div className="flex items-center justify-between gap-2 text-[12px] text-text-secondary">
        <span>인물 {personIndex + 1}의 손 · 그림 속 인물의 왼쪽과 오른쪽이에요</span>
        <button
          type="button"
          disabled={state.pending || !selection.changed.length}
          onClick={() => state.change(selection, selection.recommended)}
          className="inline-flex items-center gap-1 underline disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          추천으로 되돌리기
        </button>
      </div>
      {selection.observation.status === "unavailable" && (
        <p className="text-[12px] text-text-secondary">
          러프에서 손 모양을 읽지 못해 힘을 뺀 손으로 보여드려요. 원하는 모양으로 바꿀 수 있어요.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {sides.map((s) => (
          <button
            type="button"
            key={s}
            disabled={state.pending}
            onClick={() => {
              setSide(s);
              setCategory("");
              setQuery("");
            }}
            className="flex min-h-[52px] items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-sky disabled:opacity-50"
          >
            {byId.get(selection[s]) && (
              <HandThumbnail
                preset={byId.get(selection[s])!}
                side={s}
                librarySha={catalog.library_sha256}
              />
            )}
            <span className="min-w-0 text-[12px] text-text-primary">
              <span className="block">
                {labels[s]} · {byId.get(selection[s])?.label ?? selection[s]}
              </span>
              <span className="text-text-secondary">{status(s)}</span>
            </span>
          </button>
        ))}
      </div>
      <p role="status" className="text-[12px] text-text-secondary">
        {state.pending
          ? "손 선택 저장 중…"
          : "고른 손 모양은 저장 전 미리보기와 FBX 파일에 적용돼요."}
      </p>
      {state.changeError && (
        <p role="alert" className="text-[12px] text-brand-coral">
          {messageOf(
            state.changeError,
            "손 선택을 저장하지 못했습니다. 현재 선택을 확인하고 다시 시도해 주세요.",
          )}
        </p>
      )}
      <Modal
        open={side !== null}
        onClose={() => setSide(null)}
        title={`인물 ${personIndex + 1}의 ${side ? labels[side] : "손"} · 그림 속 인물 기준`}
        width="lg"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-[12px] text-text-secondary">
            <span>{side ? labels[side] : "손"} 미리보기</span>
            <button
              type="button"
              className="shrink-0 underline focus-visible:ring-2 focus-visible:ring-brand-sky"
              onClick={() =>
                void qc.refetchQueries({ queryKey: handThumbnailKeys.root(owner), type: "active" })
              }
            >
              이미지 다시 불러오기
            </button>
          </div>
          {!catalog.thumbnails_available && (
            <p role="status" className="text-[12px] text-text-secondary">
              손 이미지가 아직 준비되지 않았습니다.{" "}
              <button type="button" className="underline" onClick={() => void entry.retry()}>
                목록 다시 불러오기
              </button>
            </p>
          )}
          <label className="flex flex-col gap-1 text-[12px] text-text-secondary">
            손 모양 검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="컵, 주먹, 가리키기…"
              className="h-10 rounded-lg border border-border bg-surface-0 px-3 text-[14px] text-text-primary"
            />
          </label>
          {!filter && side && (
            <div>
              <p className="mb-2 text-[12px] text-text-secondary">추천 후보</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {selection.observation[side].candidates
                  .map((id) => byId.get(id))
                  .filter((p): p is HandPreset => !!p)
                  .map(tile)}
              </div>
            </div>
          )}
          <div aria-label="손 분류" className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={category === "all"}
              onClick={() => {
                setCategory("all");
                setQuery("");
              }}
              className="rounded bg-surface-2 px-2 py-1.5 text-[12px] text-text-primary"
            >
              전체 {presets.length}
            </button>
            {catalog.categories.map((c, i) => (
              <button
                type="button"
                key={c.id}
                aria-pressed={category === c.id || (!category && i === 0)}
                onClick={() => {
                  setCategory(c.id);
                  setQuery("");
                }}
                className={`rounded px-2 py-1.5 text-[12px] focus-visible:ring-2 focus-visible:ring-brand-sky ${category === c.id || (!category && i === 0) ? "bg-brand-ink text-brand-paper" : "bg-surface-2 text-text-primary"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{displayed.map(tile)}</div>
          {!displayed.length && (
            <p className="text-[12px] text-text-secondary">해당하는 손 모양이 없습니다.</p>
          )}
          {state.changeError && (
            <p role="alert" className="text-[12px] text-brand-coral">
              {messageOf(state.changeError, "선택을 저장하지 못했습니다. 다시 선택해 주세요.")}
            </p>
          )}
          <div className="sticky bottom-0 border-t border-border bg-surface-0 pt-3">
            <Button className="w-full" disabled={state.pending} onClick={() => setSide(null)}>
              {state.pending ? "저장 중…" : "선택 완료"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
