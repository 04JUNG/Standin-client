import "@/shared/styles/horizontal-scroll.css";
import "./BodyCustomPage.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { BODY_KIND_LABEL, bodyKind, type BodyKind } from "./bodyPanel";
import { LiveBodyView, NeutralImage } from "./LiveBodyView";
import { ShapeControlGrid } from "./ShapeControls";
import { sameShape, shapeDefaults } from "./shapeValues";
import { useBodyLooks } from "./looks";
import { CARD_NAME_MAX, cleanCardName, nextCardName, useBodyCards } from "./preferences";

/** [전문가용]을 켜 둔 채로 다시 오면 켜진 채로 보인다(이 기기에서만). */
const EXPERT_KEY = "standin.bodyCustom.expert";
function readExpert() {
  try {
    return localStorage.getItem(EXPERT_KEY) === "1";
  } catch {
    return false;
  }
}
function writeExpert(on: boolean) {
  try {
    localStorage.setItem(EXPERT_KEY, on ? "1" : "0");
  } catch {
    /* 저장소를 못 쓰면 이번 화면에서만 기억한다. */
  }
}

type Draft = { characterId: string; controls: Record<string, number> | null; name: string };

/**
 * 체형 커스텀: 남성·여성 체형 하나를 골라 수치를 정하고 이름 붙인 카드로 저장한다.
 * `/app/models/custom`(새 카드, `?base=` 시작 체형, `?kind=` 성별) · `/app/models/custom/:cardId`(편집).
 *
 * 처음엔 기본 조절(키·등신·체격·근육…)만 보이고, [전문가용]을 켜면 머리 크기·다리 길이·부위별
 * 근육·살까지 쉐이프키 조절이 부위별로 다 펼쳐진다. 기본 조절과 세부 조절은 따로 저장되는 축이라
 * 기본 바를 움직여도 세부 값은 그대로 남는다.
 */
export function BodyCustomPage() {
  const { cardId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { prefs, looks, find, name } = useBodyLooks();
  const { cards, change, supported } = useBodyCards();
  const card = cardId ? cards.find((c) => c.cardId === cardId) : undefined;
  const editable = looks.filter((l) => !!l.shape);
  const kinds = (["male", "female"] as const).filter((k) =>
    editable.some((l) => bodyKind(l) === k),
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [expert, setExpert] = useState(readExpert);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  // 데이터가 들어오면 한 번 시작 값을 정한다(편집: 카드 값, 새 카드: ?base / ?kind / 첫 체형).
  useEffect(() => {
    if (draft || !prefs.data || editable.length === 0) return;
    let start: Draft | null = null;
    if (cardId) {
      if (card) start = { characterId: card.characterId, controls: card.controls, name: card.name };
    } else {
      const base = editable.find((l) => l.characterId === search.get("base"));
      const kind = search.get("kind");
      const first = base ?? editable.find((l) => bodyKind(l) === kind) ?? editable[0]!;
      start = { characterId: first.characterId, controls: null, name: nextCardName(cards) };
    }
    if (!start) return;
    setDraft(start);
    setSaved(cardId ? start : null);
  }, [draft, prefs.data, editable, cardId, card, search, cards]);

  const editId = draft?.characterId;
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [editId]);

  const look = find(draft?.characterId);
  const spec = look?.shape;
  const values = spec ? { ...shapeDefaults(spec), ...(draft?.controls ?? {}) } : null;
  const kind: BodyKind = look ? bodyKind(look) : (kinds[0] ?? "male");
  const busy = change.isPending;
  const dirty =
    !!draft &&
    (!saved ||
      saved.name !== draft.name.trim() ||
      saved.characterId !== draft.characterId ||
      (!!spec && !sameShape(spec, values, saved.controls)));

  function pickBase(characterId: string) {
    if (!draft || characterId === draft.characterId) return;
    // 다른 시작 체형은 처음 값이 다르다 — 그 체형의 처음 값에서 다시 시작한다.
    setDraft({ ...draft, characterId, controls: null });
  }
  function pickKind(k: BodyKind) {
    const first = editable.find((l) => bodyKind(l) === k);
    if (first) pickBase(first.characterId);
  }
  function toggleExpert() {
    setExpert((on) => {
      writeExpert(!on);
      return !on;
    });
  }
  function save() {
    if (!draft || !values) return;
    const clean = cleanCardName(draft.name);
    if (!clean) {
      setNameError(true);
      return;
    }
    if (card)
      change.mutate(
        {
          op: "update",
          cardId: card.cardId,
          ...(clean !== card.name ? { name: clean } : {}),
          characterId: draft.characterId,
          controls: values,
        },
        { onSuccess: () => navigate("/app/models") },
      );
    else
      change.mutate(
        { op: "create", name: clean, characterId: draft.characterId, controls: values },
        { onSuccess: () => navigate("/app/models") },
      );
  }

  const missing = !!cardId && !!prefs.data && !card;
  return (
    <AppShell title="체형 커스텀">
      <div className="mx-auto max-w-[960px] space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/models")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            체형 목록
          </Button>
          <h2 className="text-[20px] font-bold text-text-primary">
            {card ? `${card.name} 편집` : "새 체형 만들기"}
          </h2>
        </div>

        {prefs.isPending && <p role="status">체형 정보를 불러오는 중…</p>}
        {prefs.isError && (
          <div role="alert" className="flex items-center gap-2">
            <p>체형 정보를 불러오지 못했습니다.</p>
            <Button variant="secondary" size="sm" onClick={() => void prefs.refetch()}>
              다시 시도
            </Button>
          </div>
        )}
        {missing && (
          <p role="alert" className="text-[14px] text-text-secondary">
            이 카드를 찾을 수 없어요. 다른 창에서 지웠을 수 있어요.
          </p>
        )}
        {prefs.data && editable.length === 0 && (
          <p role="status" className="text-[14px] text-text-secondary">
            지금은 수치를 조절할 수 있는 체형이 없어요.
          </p>
        )}
        {prefs.data && !supported && (
          <p role="status" className="text-[13px] text-text-secondary">
            이 버전에서는 만든 체형을 카드로 저장할 수 없어요. 수치를 바꿔 보며 비교할 수는 있어요.
          </p>
        )}

        {draft && look && spec && values && (
          <div className="body-custom-editor space-y-4">
            <section
              aria-label="체형 미리보기와 시작 체형"
              className="body-custom-overview flex min-w-0 items-stretch gap-4 rounded-xl border border-border bg-surface-0 p-4"
            >
              <LiveBodyView
                option={look}
                name={draft.name.trim() || name(draft.characterId)}
                controls={values}
                edited={!sameShape(spec, values, null)}
                personIndex={0}
                variant="app"
                title="미리보기"
                plainName
                interactive
                className="body-custom-live"
                badge={dirty ? "저장 안 됨" : null}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="card-name"
                    className="text-[13px] font-semibold text-text-secondary"
                  >
                    카드 이름
                  </label>
                  <input
                    id="card-name"
                    value={draft.name}
                    maxLength={CARD_NAME_MAX}
                    disabled={busy}
                    aria-invalid={nameError || undefined}
                    aria-describedby={nameError ? "card-name-error" : undefined}
                    onChange={(e) => {
                      setNameError(false);
                      setDraft({ ...draft, name: e.target.value });
                    }}
                    className={cn(
                      "h-input w-full max-w-[320px] rounded-lg border bg-surface-0 px-3 text-[14px] text-text-primary",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                      nameError ? "border-brand-coral" : "border-border",
                    )}
                  />
                  {nameError && (
                    <p id="card-name-error" className="text-[12px] text-brand-coral">
                      이름을 1–{CARD_NAME_MAX}자로 적어 주세요.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[12px] text-text-secondary">
                  성별
                  <div
                    role="group"
                    aria-label="성별"
                    className="inline-flex rounded-full border border-border bg-surface-0 p-0.5"
                  >
                    {(["male", "female"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={kind === k}
                        disabled={busy || !kinds.includes(k)}
                        onClick={() => pickKind(k)}
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

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[12px] font-semibold text-text-secondary">
                    시작 체형 · 바꾸면 그 체형의 처음 값에서 다시 시작해요
                  </span>
                  <div
                    role="radiogroup"
                    ref={strip}
                    aria-label="시작 체형"
                    tabIndex={0}
                    className="horizontal-scroll flex min-w-0 snap-x gap-2 overflow-x-auto overflow-y-hidden pb-2"
                  >
                    {editable
                      .filter((l) => bodyKind(l) === kind)
                      .map((l) => {
                        const on = l.characterId === draft.characterId;
                        return (
                          <button
                            key={l.characterId}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={busy}
                            onClick={() => pickBase(l.characterId)}
                            className={cn(
                              "flex w-[92px] shrink-0 snap-start flex-col gap-0.5 rounded-xl border-2 bg-surface-0 p-1 text-left transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                              "disabled:cursor-not-allowed",
                              on ? "border-brand-coral" : "border-border hover:border-brand-sky",
                            )}
                          >
                            <span className="flex h-[112px] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                              <NeutralImage option={l} />
                            </span>
                            <span className="truncate px-1 text-[11.5px] font-semibold">
                              {l.displayName ?? "기본 체형"}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-label="체형 조절"
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-0 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-text-primary">체형 조절</h3>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || sameShape(spec, values, null)}
                    onClick={() => setDraft({ ...draft, controls: null })}
                    title="시작 체형의 처음 값으로 되돌립니다"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    처음 값으로
                  </Button>
                  <button
                    type="button"
                    aria-pressed={expert}
                    onClick={toggleExpert}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                      expert
                        ? "border-brand-ink bg-brand-ink text-white"
                        : "border-border bg-surface-0 text-text-primary hover:border-brand-ink",
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                    전문가용
                  </button>
                </div>
              </div>
              <p className="text-[12px] text-text-secondary">
                {expert
                  ? "머리 크기, 다리 길이, 부위별 근육·살까지 모든 항목을 조절해요. 위의 기본 조절을 움직여도 세부 값은 유지돼요."
                  : "자주 쓰는 비율·키·근육·살만 보여요. 머리 크기나 다리 길이처럼 세밀한 조절은 ‘전문가용’을 켜세요."}
              </p>
              <ShapeControlGrid
                spec={spec}
                values={values}
                onChange={(key, v) => setDraft({ ...draft, controls: { ...values, [key]: v } })}
                idPrefix="body-custom"
                disabled={busy}
                detailColumns={4}
                detail={expert ? "expert" : "hidden"}
              />
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy || !supported || !dirty} loading={busy} onClick={save}>
                {card ? "변경 저장" : "카드로 저장"}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => navigate("/app/models")}>
                취소
              </Button>
              {card && (
                <Button
                  variant="ghost"
                  disabled={busy || !supported}
                  onClick={() => setConfirmDelete(true)}
                  className="ml-auto"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  카드 삭제
                </Button>
              )}
              {change.isError && (
                <span role="alert" className="text-[12px] text-brand-coral">
                  저장하지 못했어요. 최신 값을 다시 불러왔으니 확인한 뒤 다시 시도해 주세요.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {card && (
        <ConfirmDialog
          open={confirmDelete}
          title="체형 카드를 삭제할까요?"
          description={`‘${card.name}’ 카드를 지웁니다. 이미 이 체형으로 고른 인물은 그대로예요.`}
          confirmLabel="삭제"
          destructive
          loading={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            change.mutate(
              { op: "delete", cardId: card.cardId },
              { onSuccess: () => navigate("/app/models") },
            )
          }
        />
      )}
    </AppShell>
  );
}
