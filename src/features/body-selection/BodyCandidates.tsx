import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { PoseCandidateCard } from "@/features/pose-viewer/components/PoseCandidateCard";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import type {
  PersonBox,
  PersonResult,
  PoseCandidate,
} from "@/features/pose-viewer/api/pose.contract";
import { useBodyControls, type BodyEntry } from "./hooks";
import { formatShapeValue, shapeLabel } from "./shapeLabels";
import { BODY_KIND_LABEL, bodyKind, useBodyPanel, type BodyKind } from "./bodyPanel";
import { useBodyPreferences } from "./preferences";
import { LiveBodyView, NeutralImage } from "./LiveBodyView";
import type { BodyOption, BodySelection, ShapeControl, ShapeDefault, ShapeSpec } from "./contract";

/** Tailwind가 찾을 수 있게 클래스 이름을 그대로 둔다. */
const BASIC_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};
const defaults = (spec: ShapeSpec) =>
  Object.fromEntries(spec.controls.map((c) => [c.key, c.default]));

function sourceLabel(selection?: BodySelection, mine?: ShapeDefault | null) {
  if (
    selection?.shape &&
    mine &&
    mine.characterId === selection.resolvedBody?.characterId &&
    Object.entries(selection.shape.controls).every(
      ([key, value]) => Math.abs((mine.controls[key] ?? NaN) - value) < 1e-6,
    )
  )
    return "내 기본값";
  if (selection?.shape) return "직접 조절";
  switch (selection?.resolvedSource) {
    case "manual":
      return "직접 선택";
    case "fixed_default":
      return "내 기본 체형";
    case "auto_recommendation":
      return "자동 추천";
    default:
      return "기본 체형";
  }
}

function useBodyName(job: string, person: PersonResult, selection?: BodySelection) {
  const { options } = useBodyControls(job, person, selection);
  const catalog = useModelCatalog();
  return (id?: string) =>
    options.data?.characters.find((c) => c.characterId === id)?.displayName ??
    catalog.data?.characters.find((c) => c.characterId === id)?.displayName ??
    id ??
    "체형 확인 중";
}

/* ------------------------------------------------------------------ 체형 칩 */

/** 인물 줄의 체형 칩: 지금 체형과 "체형 더보기" 토글. */
export function BodyChip({
  job,
  person,
  entry,
  className,
}: {
  job: string;
  person: PersonResult;
  entry?: BodyEntry;
  className?: string;
}) {
  const { open, setOpen } = useBodyPanel(job, person.index);
  const selection = entry?.selection;
  const name = useBodyName(job, person, selection);
  const mine = useBodyPreferences().data?.shapeDefault;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-0 py-0.5 pl-2.5 pr-0.5 text-[12px]",
        className,
      )}
    >
      <span className="shrink-0 text-text-secondary">{sourceLabel(selection, mine)}</span>
      <strong className="truncate font-semibold text-text-primary">
        {name(selection?.resolvedBody?.characterId)}
        {selection?.shape ? " 수정" : ""}
      </strong>
      {/* 포즈 | 체형 더보기. 코랄 바탕이 고른 쪽으로 미끄러진다. 열고 닫는 버튼을 따로 두지 않는다. */}
      <span
        role="group"
        aria-label={`인물 ${person.index + 1} 보기`}
        className="relative grid shrink-0 grid-cols-2 rounded-full bg-surface-2 p-0.5"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-brand-coral shadow-[0_1px_3px_rgba(233,85,67,0.35)]",
            "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            open && "translate-x-full",
          )}
        />
        {(
          [
            [false, "포즈"],
            [true, "체형 더보기"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            {...(value ? { "data-body-toggle": "" } : { "data-pose-view": "" })}
            aria-pressed={open === value}
            aria-controls={value ? "body-panel-" + person.index : undefined}
            onClick={() => setOpen(value)}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full px-3 py-1 text-center text-[12px] font-semibold transition-colors duration-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              open === value ? "text-white" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </span>
    </span>
  );
}

/** 접힌 인물 줄용 한 줄 표기: "자동 추천 · 기본". */
export function BodyLabel({
  job,
  person,
  entry,
}: {
  job: string;
  person: PersonResult;
  entry?: BodyEntry;
}) {
  const selection = entry?.selection;
  const name = useBodyName(job, person, selection);
  const mine = useBodyPreferences().data?.shapeDefault;
  return (
    <span className="truncate text-[12px] text-text-secondary">
      {sourceLabel(selection, mine)} ·{" "}
      <span className="font-semibold text-text-primary">
        {name(selection?.resolvedBody?.characterId)}
        {selection?.shape ? " 수정" : ""}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ Top-5 카드 */

/** 선택한 체형으로 그린 후보 카드들. 그리드는 화면이 정한다. */
export function BodyCandidateCards({
  person,
  entry,
  selected,
  onSelect,
  layout,
  disabled,
  cardClassName,
}: {
  person: PersonResult;
  entry?: BodyEntry;
  selected?: string;
  onSelect: (id: string) => void;
  layout?: "default" | "fill";
  disabled?: boolean;
  cardClassName?: (index: number) => string | undefined;
}) {
  const ready = entry?.ready === true;
  return (
    <>
      {person.candidates.map((candidate, i) => (
        <div key={candidate.id} className={cn("min-h-0", cardClassName?.(i))}>
          <PoseCandidateCard
            candidate={candidate}
            isSelected={candidate.id === selected}
            onSelect={() => onSelect(candidate.id)}
            layout={layout}
            disabled={disabled}
            bodyPreview={{
              url: ready ? entry?.group?.images[candidate.id] : undefined,
              pending: !ready,
            }}
          />
        </div>
      ))}
    </>
  );
}

/** 선택한 체형으로 그린 후보 카드 한 장(바의 칸 배치처럼 화면이 칸을 직접 정할 때). */
export function BodyCandidateCard({
  candidate,
  entry,
  selected,
  onSelect,
  disabled,
}: {
  candidate: PoseCandidate;
  entry?: BodyEntry;
  selected?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const ready = entry?.ready === true;
  return (
    <PoseCandidateCard
      candidate={candidate}
      isSelected={candidate.id === selected}
      onSelect={() => onSelect(candidate.id)}
      layout="fill"
      disabled={disabled}
      bodyPreview={{
        url: ready ? entry?.group?.images[candidate.id] : undefined,
        pending: !ready,
      }}
    />
  );
}

/** 새 체형으로 후보를 다시 그리는 중이거나 실패했을 때 한 줄로 알린다. */
export function BodyRenderStatus({ entry }: { entry?: BodyEntry }) {
  if (!entry || entry.ready) return null;
  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center gap-2 text-[11.5px] text-text-secondary"
    >
      {entry.error ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-brand-coral" aria-hidden />
          체형 미리보기를 준비하지 못했습니다.
          <button
            type="button"
            className="font-semibold text-text-primary underline underline-offset-2"
            onClick={() => void entry.retry()}
          >
            다시 시도
          </button>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b7791f]" aria-hidden />
          선택한 체형으로 후보를 다시 그리는 중…
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 체형 펼쳐보기 */

function ShapeSlider({
  control,
  value,
  disabled,
  onChange,
  id,
}: {
  control: ShapeControl;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
  id: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(32px,auto)_minmax(0,1fr)_44px] items-center gap-1.5">
      <label
        htmlFor={id}
        className="whitespace-nowrap text-[11.5px] font-semibold text-text-primary"
      >
        {control.label ?? shapeLabel(control.key)}
      </label>
      <input
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[18px] w-full accent-brand-coral disabled:opacity-40"
      />
      <output htmlFor={id} className="text-right font-mono text-[10.5px] text-text-secondary">
        {formatShapeValue(control, value)}
      </output>
    </div>
  );
}

/**
 * "체형 더보기"를 열면 Top-5 자리에 그린다: 체형 종류, [내 체형 | 프리셋 줄], 조절 바.
 * 조절 바는 왼쪽 "내 체형"만 다시 그린다. 프리셋 카드는 고정 그림이고 고른 것에 "선택됨"만 붙는다.
 *
 * 카드를 누르면 바로 이 인물에 저장한다(포즈 선택은 유지). 수치 조절은 서버가 그 체형에
 * `shape`를 알려 줄 때만 열린다 — 아니면 조절 바 대신 지원하지 않는다고 적는다.
 */
export function BodyExpand({
  job,
  person,
  entry,
  rough,
  variant,
}: {
  job: string;
  person: PersonResult;
  entry?: BodyEntry;
  rough?: { url?: string; box?: PersonBox | null };
  variant: "bar" | "app";
}) {
  const selection = entry?.selection;
  const { options, mutation } = useBodyControls(job, person, selection);
  const preferences = useBodyPreferences();
  const name = useBodyName(job, person, selection);
  const characters = options.data?.characters ?? [];
  const currentId = selection?.resolvedBody?.characterId;
  const current = characters.find((c) => c.characterId === currentId);
  const kinds = (["male", "female", "child"] as const).filter((k) =>
    characters.some((c) => bodyKind(c) === k),
  );
  const [kindView, setKindView] = useState<BodyKind | null>(null);
  const kind: BodyKind = kindView ?? (current ? bodyKind(current) : (kinds[0] ?? "male"));
  const visible = characters.filter((c) => bodyKind(c) === kind);

  /* ---- 수치 조절: 손을 뗀 뒤 0.6초 쉬면 저장. 저장 중이면 끝난 뒤 마지막 값을 보낸다. */
  const spec = current?.shape;
  const basic = Math.min(spec?.basic ?? 5, spec?.controls.length ?? 5);
  const saved = spec ? { ...defaults(spec), ...(selection?.shape?.controls ?? {}) } : {};
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const values = draft ?? saved;
  const latest = useRef<Record<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pendingRef = useRef(false);
  pendingRef.current = mutation.isPending;
  const [flush, setFlush] = useState(false);
  useEffect(() => {
    // 다른 체형을 고르면 손대던 값은 버린다.
    setDraft(null);
    latest.current = null;
    clearTimeout(timer.current);
  }, [currentId]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function sendShape() {
    if (!currentId || !latest.current) return;
    if (pendingRef.current) {
      setFlush(true);
      return;
    }
    const controls = latest.current;
    mutation.mutate(
      { intent: "manual", characterId: currentId, shape: { controls } },
      {
        onSettled: () => {
          if (latest.current === controls) {
            latest.current = null;
            setDraft(null);
          } else if (latest.current) {
            // 저장하는 사이 더 움직였다. 새 revision을 받은 다음 렌더에서 보낸다.
            setFlush(true);
          }
        },
      },
    );
  }
  useEffect(() => {
    if (!flush || mutation.isPending) return;
    setFlush(false);
    sendShape();
    // sendShape는 매 렌더 새로 만들어진다. 최신 selection을 쓰도록 revision에 묶는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush, mutation.isPending, selection?.selectionRevision]);
  function changeControl(key: string, value: number) {
    const next = { ...values, [key]: value };
    setDraft(next);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(sendShape, 600);
  }

  /* ---- 버튼 */
  const busy = mutation.isPending || !selection;
  const prefs = preferences.data;
  const selectable = (id?: string | null) =>
    !!id && characters.some((c) => c.characterId === id && c.selectable);
  const mineShape =
    prefs?.shapeDefault &&
    characters.some((c) => c.characterId === prefs.shapeDefault!.characterId && c.shape)
      ? prefs.shapeDefault
      : null;
  const mineId = mineShape?.characterId ?? prefs?.defaultCharacterId ?? null;
  const canMine = selectable(mineId);
  function applyMine() {
    if (!mineId) return;
    setKindView(null);
    mutation.mutate(
      mineShape
        ? { intent: "manual", characterId: mineId, shape: { controls: mineShape.controls } }
        : { intent: "manual", characterId: mineId },
    );
  }
  function pick(option: BodyOption) {
    if (busy || !option.selectable) return;
    if (option.characterId === currentId && !selection?.shape) return;
    mutation.mutate({ intent: "manual", characterId: option.characterId });
  }

  const status = mutation.isPending
    ? "저장 중…"
    : draft
      ? "손을 떼면 저장합니다"
      : mutation.isError
        ? null
        : selection?.shape
          ? "이 인물에 저장됨"
          : "처음 값 그대로";

  return (
    <section
      id={"body-panel-" + person.index}
      aria-label={`인물 ${person.index + 1} 체형 선택`}
      className="flex min-h-0 w-full min-w-0 flex-col gap-2"
    >
      {/* 체형 종류 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          체형 종류
          <div
            role="group"
            aria-label="체형 종류"
            className="inline-flex rounded-full border border-border bg-surface-0 p-0.5"
          >
            {(["male", "female", "child"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                disabled={!kinds.includes(k)}
                onClick={() => setKindView(k)}
                className={cn(
                  "rounded-full px-3.5 py-0.5 text-[12px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  kind === k
                    ? "bg-brand-ink text-white"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {BODY_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-text-secondary">
          체형을 누르면 바로 적용 · 이 인물만 바뀌고 포즈 선택은 유지됩니다
        </p>
      </div>

      {/* 내 체형(왼쪽, 실시간) | 프리셋(오른쪽, 고정) */}
      {options.isError ? (
        <div className="flex items-center gap-2 text-[12px] text-text-secondary" role="alert">
          체형 목록을 불러오지 못했습니다.
          <Button variant="secondary" size="sm" onClick={() => void options.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : options.isPending ? (
        <p role="status" className="text-[12px] text-text-secondary">
          체형 목록을 불러오는 중…
        </p>
      ) : (
        <div className="flex min-w-0 shrink-0 items-stretch gap-2">
          {/* 왼쪽: 지금 고른 체형. 조절 바를 움직이면 여기만 다시 그린다. */}
          <LiveBodyView
            option={current}
            name={name(currentId)}
            controls={spec ? values : null}
            edited={!!spec && (!!draft || !!selection?.shape)}
            rough={rough}
            personIndex={person.index}
            variant={variant}
          />
          {/* 오른쪽: 프리셋. 고정 그림이라 조절 바와 무관하다 — 고른 것에 표시만 한다. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1 border-l border-border pl-2">
            <span className="text-[11px] font-semibold text-text-secondary">
              프리셋 · 누르면 그 체형으로 바뀌어요
            </span>
            <div
              role="radiogroup"
              aria-label="체형 프리셋"
              className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1"
            >
              {visible.map((option) => {
                const on = option.characterId === currentId;
                return (
                  <button
                    type="button"
                    role="radio"
                    key={option.characterId}
                    aria-checked={on}
                    disabled={!option.selectable || busy}
                    onClick={() => pick(option)}
                    className={cn(
                      "relative flex shrink-0 snap-start flex-col gap-0.5 rounded-xl border-2 bg-surface-0 p-1 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                      "disabled:cursor-not-allowed",
                      !option.selectable && "opacity-40",
                      on ? "border-brand-coral" : "border-border hover:border-brand-sky",
                      variant === "bar" ? "w-[96px]" : "w-[140px]",
                    )}
                  >
                    {on && (
                      <span className="absolute left-2 top-2 z-10 rounded-full bg-brand-coral px-1.5 text-[10px] font-semibold text-white">
                        선택됨
                      </span>
                    )}
                    <span
                      className={cn(
                        "flex w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2",
                        variant === "bar" ? "h-[120px]" : "h-[196px]",
                      )}
                    >
                      <NeutralImage option={option} />
                    </span>
                    <span className="truncate px-1 text-[11.5px] font-semibold">
                      {name(option.characterId)}
                    </span>
                    <span className="px-1 pb-0.5 text-[10px] text-text-secondary">
                      {!option.selectable
                        ? "현재 포즈에 사용 불가"
                        : option.shape
                          ? "조절 가능"
                          : "고정 체형"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 조절 바 */}
      <div className="flex shrink-0 flex-col gap-1.5 rounded-xl border border-border bg-surface-0 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-text-secondary">
          <span className="truncate">
            체형 조절 ·{" "}
            <strong className="text-text-primary">
              {name(currentId)}
              {selection?.shape || draft ? " 수정" : ""}
            </strong>
          </span>
          {spec && status && <span aria-live="polite">{status}</span>}
        </div>
        {spec ? (
          <>
            {/* 기본 조절은 두 줄: 윗줄이 한 칸 더 많다(5개 → 3·2, 7개 → 4·3). */}
            <div
              data-basic-controls={basic}
              className={cn(
                "grid gap-x-4 gap-y-1",
                BASIC_COLUMNS[Math.ceil(basic / 2)] ?? "grid-cols-4",
              )}
            >
              {spec.controls.slice(0, basic).map((control) => (
                <ShapeSlider
                  key={control.key}
                  id={`shape-${person.index}-${control.key}`}
                  control={control}
                  value={values[control.key] ?? control.default}
                  disabled={!selection}
                  onChange={(v) => changeControl(control.key, v)}
                />
              ))}
            </div>
            {spec.controls.length > basic && (
              <details className="text-[11px] text-text-secondary">
                <summary className="cursor-pointer select-none">
                  세부 조절 {spec.controls.length - basic}개
                </summary>
                <div
                  className={cn(
                    "mt-1.5 grid gap-x-4 gap-y-1",
                    variant === "bar" ? "grid-cols-3" : "grid-cols-4",
                  )}
                >
                  {spec.controls.slice(basic).map((control) => (
                    <ShapeSlider
                      key={control.key}
                      id={`shape-${person.index}-${control.key}`}
                      control={control}
                      value={values[control.key] ?? control.default}
                      disabled={!selection}
                      onChange={(v) => changeControl(control.key, v)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-[11.5px] text-text-secondary">
            {current && bodyKind(current) !== "male"
              ? `${BODY_KIND_LABEL[bodyKind(current)]} 체형은 아직 수치로 조절할 수 없어요 · 고정 체형`
              : "이 체형은 아직 수치로 조절할 수 없어요 · 다른 체형을 골라 비교하세요"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton
            disabled={busy || selection?.recommendation.status !== "available"}
            onClick={() => {
              setKindView(null);
              mutation.mutate({ intent: "auto" });
            }}
            title={
              selection?.recommendation.status === "available"
                ? "러프에 맞춰 추천한 체형으로 바꿉니다"
                : "이 인물은 자동 추천을 만들지 못했어요"
            }
          >
            <Sparkles className="h-3 w-3 text-brand-coral" aria-hidden />
            자동 추천
          </ToolButton>
          <ToolButton
            disabled={busy || !canMine}
            onClick={applyMine}
            title={
              canMine
                ? "설정의 내 기본 체형으로 바꿉니다"
                : "설정 › 체형 기본 설정에서 내 기본 체형을 정할 수 있어요"
            }
          >
            내 기본값
          </ToolButton>
          <ToolButton
            disabled={busy || !currentId || (!selection?.shape && !draft)}
            onClick={() => {
              clearTimeout(timer.current);
              latest.current = null;
              setDraft(null);
              if (currentId) mutation.mutate({ intent: "manual", characterId: currentId });
            }}
            title="고른 체형의 처음 값으로 되돌립니다"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            초기화
          </ToolButton>
          {mutation.isError && (
            <span role="alert" className="text-[11px] text-brand-coral">
              체형을 저장하지 못했습니다. 현재 선택을 확인한 뒤 다시 시도해 주세요.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function ToolButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface-0 px-2.5 text-[11.5px] font-semibold text-text-primary",
        "transition-colors hover:border-brand-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
      )}
    >
      {children}
    </button>
  );
}
