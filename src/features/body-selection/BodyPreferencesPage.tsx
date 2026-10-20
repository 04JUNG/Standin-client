import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useInstallationStore } from "@/features/installation/installationStore";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { bodyKeys, putPreferences } from "./api";
import { useBodyOwner } from "./hooks";
import { BODY_KIND_LABEL, bodyKind, type BodyKind } from "./bodyPanel";
import { NeutralImage, ShapeThumb } from "./LiveBodyView";
import { useBodyLooks } from "./looks";
import { CARD_NAME_MAX, cleanCardName, matchCard, useBodyCards } from "./preferences";
import { sameShape } from "./shapeValues";
import type { BodyCard, BodyLook, BodyPreferences } from "./contract";

/**
 * 체형 커스텀(모델 화면): 내 체형 카드 + 기본 모델(프리셋) + 새 작업의 시작 체형.
 *
 * - "+"를 누르면 체형 커스텀 편집 화면으로 간다. 조절 가능한 프리셋을 눌러도 그 체형에서 시작한다.
 * - 내 체형 카드는 여기서 이름을 바꾸고 지울 수 있다. 기본 모델(프리셋)은 바꾸거나 지울 수 없다.
 * - 저장한 카드는 후보 화면의 ‘체형 더보기’에 나온다. 새 작업은 마지막으로 고른 체형으로 시작한다.
 */
export function BodyPreferencesPage() {
  const navigate = useNavigate();
  const { prefs, catalog, looks, find, name } = useBodyLooks();
  const { cards, change, supported } = useBodyCards();
  const owner = useBodyOwner();
  const qc = useQueryClient();
  const mode = useMutation({
    mutationFn: (next: BodyPreferences["mode"]) => {
      if (!prefs.data) throw new Error("preferences missing");
      return putPreferences({ mode: next }, prefs.data.revision);
    },
    onSuccess: (value) => {
      if (useInstallationStore.getState().credentials?.installationId === owner)
        qc.setQueryData(bodyKeys.preferences(owner), value);
    },
    onError: () => void prefs.refetch(),
  });
  const [kindView, setKindView] = useState<BodyKind | "all">("all");
  const [deleting, setDeleting] = useState<BodyCard | null>(null);

  const value = prefs.data;
  const kinds = (["male", "female", "child"] as const).filter((k) =>
    looks.some((l) => bodyKind(l) === k),
  );
  const presets = looks.filter((l) => kindView === "all" || bodyKind(l) === kindView);
  const last = value?.lastUsed;
  const lastLook = find(last?.characterId);
  const lastLabel = last
    ? (matchCard(cards, last.characterId, last.controls, lastLook?.shape)?.name ??
      `${name(last.characterId)}${
        last.controls && lastLook?.shape && !sameShape(lastLook.shape, last.controls, null)
          ? " 수정"
          : ""
      }`)
    : null;

  return (
    <AppShell title="체형 커스텀">
      <div className="mx-auto max-w-[880px] space-y-6">
        <div>
          <h2 className="text-[22px] font-bold text-text-primary">체형 커스텀</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            자주 그리는 캐릭터 체형을 만들어 카드로 저장하세요. 저장한 카드는 후보 화면의 ‘체형
            더보기’에서 바로 고를 수 있어요.
          </p>
        </div>

        {prefs.isPending && <p role="status">체형 설정을 불러오는 중…</p>}
        {prefs.isError && (
          <div role="alert" className="flex items-center gap-2">
            <p>체형 설정을 불러오지 못했습니다.</p>
            <Button variant="secondary" size="sm" onClick={() => void prefs.refetch()}>
              다시 시도
            </Button>
          </div>
        )}

        {value && (
          <section
            aria-labelledby="new-work-body-title"
            className="space-y-3 rounded-xl border border-border bg-surface-0 p-4"
          >
            <h3 id="new-work-body-title" className="text-base font-bold">
              새 작업을 시작할 때
            </h3>
            <p className="text-xs text-text-secondary">
              다음 분석부터 적용됩니다. 각 인물의 체형은 후보 화면의 ‘체형 더보기’에서 따로 바꿀 수
              있어요.
            </p>
            <fieldset disabled={mode.isPending} className="space-y-2">
              <legend className="sr-only">새 작업의 체형</legend>
              <ModeOption
                checked={value.mode === "last_used"}
                onChange={() => mode.mutate("last_used")}
                title="마지막으로 쓴 체형 (기본)"
                description={
                  lastLabel
                    ? `후보 화면에서 마지막으로 고른 체형으로 시작해요 · 지금은 ‘${lastLabel}’. 그 체형을 쓸 수 없으면 남성 기본형으로 시작해요.`
                    : "후보 화면에서 마지막으로 고른 체형·카드로 시작해요. 아직 고른 적이 없으면 남성 기본형으로 시작해요."
                }
              />
              <ModeOption
                checked={value.mode === "auto"}
                onChange={() => mode.mutate("auto")}
                title="자동 추천"
                description="러프에 맞춰 추천한 체형으로 시작해요. 추천을 찾지 못하면 남성 기본형으로 시작해요."
              />
            </fieldset>
            {mode.isError && (
              <p role="alert" className="text-[12px] text-brand-coral">
                설정을 저장하지 못했습니다. 현재 값을 확인하고 다시 시도해 주세요.
              </p>
            )}
          </section>
        )}

        {value && (
          <section aria-labelledby="my-bodies-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="my-bodies-title" className="text-[15px] font-bold text-text-primary">
                내 체형
              </h3>
              <span className="text-[12px] text-text-secondary">
                {cards.length ? `${cards.length}장` : "아직 없어요"}
              </span>
            </div>
            {!supported && cards.length > 0 && (
              <p role="status" className="mt-1 text-[12px] text-text-secondary">
                이 버전에서는 저장한 체형의 이름을 바꾸거나 카드를 지울 수 없어요.
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => navigate("/app/models/custom")}
                aria-label="새 체형 만들기"
                className={cn(
                  "flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-0 p-3 text-center transition-colors",
                  "hover:border-brand-coral hover:text-brand-coral",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                )}
              >
                <Plus className="h-10 w-10" aria-hidden />
                <span className="text-[14px] font-semibold">새 체형 만들기</span>
                <span className="text-[12px] text-text-secondary">
                  남성·여성 체형을 세밀하게 조절해 카드로 저장해요
                </span>
              </button>
              {cards.map((card) => (
                <CardTile
                  key={card.cardId}
                  card={card}
                  look={find(card.characterId)}
                  baseName={name(card.characterId)}
                  editable={supported}
                  busy={change.isPending}
                  onOpen={() => navigate(`/app/models/custom/${encodeURIComponent(card.cardId)}`)}
                  onRename={(next) =>
                    change.mutateAsync({ op: "update", cardId: card.cardId, name: next })
                  }
                  onDelete={() => setDeleting(card)}
                />
              ))}
            </div>
            {change.isError && !deleting && (
              <p role="alert" className="mt-2 text-[12px] text-brand-coral">
                카드를 저장하지 못했어요. 최신 목록을 다시 불러왔으니 확인한 뒤 다시 시도해 주세요.
              </p>
            )}
          </section>
        )}

        {looks.length > 0 && (
          <section aria-labelledby="preset-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="preset-title" className="text-[15px] font-bold text-text-primary">
                기본 모델
              </h3>
              <div
                role="group"
                aria-label="기본 모델 종류"
                className="inline-flex rounded-full border border-border bg-surface-0 p-0.5"
              >
                {(["all", ...kinds] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kindView === k}
                    onClick={() => setKindView(k)}
                    className={cn(
                      "rounded-full px-3 py-0.5 text-[12px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                      kindView === k
                        ? "bg-brand-ink text-white"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {k === "all" ? "전체" : BODY_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[12px] text-text-secondary">
              기본 모델은 바꾸거나 지울 수 없어요. 조절 가능한 모델을 누르면 그 체형에서 커스텀을
              시작해요.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
              {presets.map((look) => (
                <PresetTile
                  key={look.characterId}
                  look={look}
                  onCustomize={
                    look.shape
                      ? () =>
                          navigate(
                            `/app/models/custom?base=${encodeURIComponent(look.characterId)}`,
                          )
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        )}
        {(catalog.isError || catalog.data?.origin === "fallback") && (
          <p role="alert" className="text-xs text-text-secondary">
            사용 가능한 체형 목록을 확인하지 못했습니다.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={!!deleting}
        title="체형 카드를 삭제할까요?"
        description={
          deleting
            ? `‘${deleting.name}’ 카드를 지웁니다. 이미 이 체형으로 고른 인물은 그대로예요.`
            : ""
        }
        confirmLabel="삭제"
        destructive
        loading={change.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          change.mutate(
            { op: "delete", cardId: deleting.cardId },
            { onSettled: () => setDeleting(null) },
          )
        }
      />
    </AppShell>
  );
}

function ModeOption({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange(): void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <input type="radio" name="body-mode" className="mt-1" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-text-secondary">{description}</span>
      </span>
    </label>
  );
}

/** 내 체형 카드 한 장: 누르면 편집, 연필로 이름 변경(그 자리에서), 휴지통으로 삭제. */
function CardTile({
  card,
  look,
  baseName,
  editable,
  busy,
  onOpen,
  onRename,
  onDelete,
}: {
  card: BodyCard;
  look?: BodyLook;
  baseName: string;
  editable: boolean;
  busy: boolean;
  onOpen(): void;
  onRename(name: string): Promise<unknown>;
  onDelete(): void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const kind = look ? BODY_KIND_LABEL[bodyKind(look)] : null;
  async function commit() {
    if (renaming === null) return;
    const next = cleanCardName(renaming);
    if (!next) {
      setInvalid(true);
      return;
    }
    if (next !== card.name) {
      try {
        await onRename(next);
      } catch {
        return; // 오류는 목록 아래에 한 줄로 알린다. 입력은 그대로 둔다.
      }
    }
    setRenaming(null);
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-3">
      <button
        type="button"
        onClick={onOpen}
        disabled={!editable || !look?.shape}
        aria-label={`${card.name} 편집`}
        className={cn(
          "flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
          "enabled:hover:ring-2 enabled:hover:ring-brand-sky/60 disabled:cursor-default",
        )}
      >
        {look ? (
          <ShapeThumb look={look} controls={card.controls} />
        ) : (
          <span className="p-2 text-center text-[12px] text-text-secondary">
            기준 체형을 찾을 수 없어요
          </span>
        )}
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
            maxLength={CARD_NAME_MAX}
            disabled={busy}
            onChange={(e) => {
              setInvalid(false);
              setRenaming(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenaming(null);
            }}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border bg-surface-0 px-2 text-[13px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
              invalid ? "border-brand-coral" : "border-border",
            )}
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
            <div className="truncate text-[14px] font-semibold text-text-primary">{card.name}</div>
            <div className="truncate text-[12px] text-text-secondary">
              {[kind, `${baseName} 기반`].filter(Boolean).join(" · ")}
            </div>
          </div>
          {editable && (
            <div className="flex shrink-0 items-center">
              <IconButton
                label={`${card.name} 이름 변경`}
                disabled={busy}
                onClick={() => setRenaming(card.name)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
              <IconButton label={`${card.name} 삭제`} disabled={busy} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 기본 모델(프리셋) 한 장. 이름 변경·삭제는 없다. 조절 가능한 체형만 눌러서 커스텀을 시작한다. */
function PresetTile({ look, onCustomize }: { look: BodyLook; onCustomize?: () => void }) {
  const kind = BODY_KIND_LABEL[bodyKind(look)];
  const body = (
    <>
      <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        <NeutralImage option={look} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-semibold text-text-primary">
          {look.displayName ?? "기본 체형"}
        </span>
        <span className="text-[12px] text-text-secondary">
          {kind} · {onCustomize ? "눌러서 커스텀" : "고정 체형"}
        </span>
      </span>
    </>
  );
  const box = "flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-3 text-left";
  return onCustomize ? (
    <button
      type="button"
      onClick={onCustomize}
      className={cn(
        box,
        "transition-colors hover:border-brand-sky/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

function IconButton({
  label,
  children,
  type = "button",
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors",
        "hover:bg-surface-2 hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
