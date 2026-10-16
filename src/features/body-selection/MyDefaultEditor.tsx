import { useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/components/Button";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import type { BodyLook } from "./contract";
import { BODY_KIND_LABEL, bodyKind, type BodyKind } from "./bodyPanel";
import { LiveBodyView, NeutralImage } from "./LiveBodyView";
import { ShapeControlGrid } from "./ShapeControls";
import { sameShape, shapeDefaults } from "./shapeValues";
import { useMyDefault, type MyDefault } from "./preferences";

/**
 * 설정(모델 화면)의 "내 기본값": 체형 하나와 그 수치를 정한다.
 * 후보 화면의 "내 기본값" 버튼이 불러오고, "내 기본값으로 저장"이 여기 값을 바꾼다.
 *
 * 고를 수 있는 체형 = 서버가 수치 조절을 허락한 체형(`shapeEditable`) + 모델 목록의 사용 가능한
 * 체형(수치 없이 그대로). 둘 다 없으면 이 칸을 그리지 않는다.
 */
export function MyDefaultEditor() {
  const { query, value: saved, save } = useMyDefault();
  const catalog = useModelCatalog();
  const looks = useMemo(() => {
    const out = new Map<string, BodyLook>();
    for (const e of query.data?.shapeEditable ?? []) out.set(e.characterId, { ...e });
    if (catalog.data?.origin === "server")
      for (const c of catalog.data.characters) {
        if (!c.bodyRef || c.availability !== "available") continue;
        const known = out.get(c.characterId);
        out.set(c.characterId, {
          ...known,
          characterId: c.characterId,
          displayName: known?.displayName ?? c.displayName,
          bodyRef: c.bodyRef,
        });
      }
    return [...out.values()];
  }, [query.data, catalog.data]);
  const name = (id: string) => looks.find((l) => l.characterId === id)?.displayName ?? id;

  // 편집 중인 값. 저장값(없으면 첫 체형의 처음 값)에서 시작한다.
  const start = (): MyDefault | null => {
    if (saved && looks.some((l) => l.characterId === saved.characterId)) return saved;
    const first = looks[0];
    return first ? { characterId: first.characterId, controls: null } : null;
  };
  const [edit, setEdit] = useState<MyDefault | null>(start);
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    // 저장이 끝났거나(다른 화면 포함) 목록이 처음 들어오면 편집을 저장값에 맞춘다.
    setEdit(start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, looks.length]);
  const [kindView, setKindView] = useState<BodyKind | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const editId = edit?.characterId;
  useEffect(() => {
    // 고른 체형 카드가 줄 밖에 있으면 보이게 옮긴다(저장된 값으로 열었을 때 등).
    strip.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [editId, kindView]);

  if (!query.data || looks.length === 0 || !edit) return null;
  const look = looks.find((l) => l.characterId === edit.characterId);
  const spec = look?.shape;
  const values = spec ? { ...shapeDefaults(spec), ...(edit.controls ?? {}) } : null;
  const kinds = (["male", "female", "child"] as const).filter((k) =>
    looks.some((l) => bodyKind(l) === k),
  );
  const kind: BodyKind = kindView ?? (look ? bodyKind(look) : (kinds[0] ?? "male"));
  const visible = looks.filter((l) => bodyKind(l) === kind);
  const busy = save.isPending;
  const dirty =
    !saved ||
    saved.characterId !== edit.characterId ||
    (spec ? !sameShape(spec, values, saved.controls) || !saved.controls : !!saved.controls);
  const savedLook = saved ? looks.find((l) => l.characterId === saved.characterId) : undefined;
  const savedLabel = saved
    ? `${savedLook ? BODY_KIND_LABEL[bodyKind(savedLook)] + " " : ""}${name(saved.characterId)}${
        savedLook?.shape && saved.controls && !sameShape(savedLook.shape, saved.controls, null)
          ? " 수정"
          : ""
      }`
    : null;

  function pick(characterId: string) {
    setEdit({
      characterId,
      // 저장해 둔 체형으로 돌아오면 그 수치에서, 아니면 처음 값에서 시작한다.
      controls: saved?.characterId === characterId ? saved.controls : null,
    });
  }

  return (
    <section
      aria-labelledby="my-default-title"
      className="space-y-3 rounded-xl border border-border bg-surface-0 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="my-default-title" className="flex items-center gap-1.5 text-base font-bold">
          <Star className="h-4 w-4 text-brand-coral" aria-hidden />내 기본값
        </h3>
        <span className="text-xs text-text-secondary" aria-live="polite">
          {busy
            ? "저장 중…"
            : savedLabel
              ? `저장됨 · ${savedLabel}`
              : "아직 없어요 · 체형을 고르고 저장하세요"}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        자주 쓰는 캐릭터 체형을 저장해 두면 후보 화면 ‘체형 더보기’의 <b>내 기본값</b> 버튼으로 한
        번에 불러올 수 있어요. 후보 화면에서 ‘내 기본값으로 저장’을 눌러도 여기가 바뀝니다.
      </p>

      <div className="flex min-w-0 items-stretch gap-3">
        <LiveBodyView
          option={look}
          name={name(edit.characterId)}
          controls={values}
          edited={!!spec && !!edit.controls && !sameShape(spec, values, null)}
          personIndex={0}
          variant="app"
          title="내 기본값"
          badge={dirty ? "저장 안 됨" : null}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            role="group"
            aria-label="체형 종류"
            className="inline-flex w-fit rounded-full border border-border bg-surface-0 p-0.5"
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
          <div
            role="radiogroup"
            ref={strip}
            aria-label="내 기본값 체형"
            className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1"
          >
            {visible.map((l) => {
              const on = l.characterId === edit.characterId;
              return (
                <button
                  key={l.characterId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => pick(l.characterId)}
                  className={cn(
                    "relative flex w-[96px] shrink-0 snap-start flex-col gap-0.5 rounded-xl border-2 bg-surface-0 p-1 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky",
                    "disabled:cursor-not-allowed",
                    on ? "border-brand-coral" : "border-border hover:border-brand-sky",
                  )}
                >
                  {saved?.characterId === l.characterId && (
                    <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full border border-brand-ink/20 bg-surface-0/95 px-1 text-[9.5px] font-semibold text-brand-ink">
                      <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                      저장됨
                    </span>
                  )}
                  <span className="flex h-[120px] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                    <NeutralImage option={l} />
                  </span>
                  <span className="truncate px-1 text-[11.5px] font-semibold">
                    {l.displayName ?? l.characterId}
                  </span>
                  <span className="px-1 pb-0.5 text-[10px] text-text-secondary">
                    {l.shape ? "조절 가능" : "고정 체형"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-1 px-2.5 py-2">
        {spec && values ? (
          <ShapeControlGrid
            spec={spec}
            values={values}
            onChange={(key, v) => setEdit({ ...edit, controls: { ...values, [key]: v } })}
            idPrefix="my-default"
            disabled={busy}
            detailColumns={4}
          />
        ) : (
          <p className="text-[11.5px] text-text-secondary">
            이 체형은 수치 조절 없이 그대로 내 기본값이 돼요.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy || !dirty}
          onClick={() =>
            save.mutate({
              characterId: edit.characterId,
              controls: spec && values ? values : null,
            })
          }
        >
          내 기본값으로 저장
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !dirty || !saved}
          onClick={() => setEdit(start())}
          title="저장된 내 기본값으로 되돌립니다"
        >
          되돌리기
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !saved}
          onClick={() => save.mutate(null)}
          title="내 기본값을 지웁니다 · 새 작업은 자동 추천으로 시작해요"
        >
          지우기
        </Button>
        {save.isError && (
          <span role="alert" className="text-xs text-brand-coral">
            저장하지 못했어요. 최신 값을 다시 불러왔으니 확인한 뒤 다시 저장해 주세요.
          </span>
        )}
      </div>
    </section>
  );
}
