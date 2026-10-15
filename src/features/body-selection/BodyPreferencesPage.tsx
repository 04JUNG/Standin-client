import { useEffect, useState } from "react";
import { useInstallationStore } from "@/features/installation/installationStore";
import type { ShapeSpec } from "./contract";
import { formatShapeValue, shapeLabel } from "./shapeLabels";
import { useBodyPreferences } from "./preferences";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { bodyKeys, putPreferences } from "./api";
import { useBodyOwner } from "./hooks";
export function BodyPreferencesPage() {
  const query = useBodyPreferences(),
    owner = useBodyOwner(),
    qc = useQueryClient(),
    catalog = useModelCatalog();
  const mutation = useMutation({
    mutationFn: (change: {
      mode: "auto" | "fixed_default";
      defaultCharacterId: string | null;
      shapeDefault?: { characterId: string; controls: Record<string, number> } | null;
    }) => {
      if (!query.data) throw new Error("preferences missing");
      return putPreferences(change, query.data.revision);
    },
    onSuccess: (value) => {
      if (useInstallationStore.getState().credentials?.installationId === owner)
        qc.setQueryData(bodyKeys.preferences(owner), value);
    },
    onError: () => {
      void query.refetch();
    },
  });
  const value = query.data,
    busy = mutation.isPending || !value;
  const options =
    catalog.data?.origin === "server"
      ? catalog.data.characters.filter((c) => c.bodyRef && c.availability === "available")
      : [];
  return (
    <AppShell title="체형 기본 설정">
      <div className="mx-auto max-w-[880px] space-y-5">
        <h2 className="text-xl font-bold">새 작업의 체형</h2>
        <p className="text-sm text-text-secondary">
          설정은 다음 분석부터 적용됩니다. 진행 중인 인물의 체형은 바뀌지 않습니다.
        </p>
        {query.isPending && <p role="status">체형 설정을 불러오는 중…</p>}
        {query.isError && (
          <div role="alert">
            <p>체형 설정을 불러오지 못했습니다.</p>
            <Button onClick={() => void query.refetch()}>다시 시도</Button>
          </div>
        )}
        {value && (
          <fieldset disabled={busy} className="space-y-4">
            <legend className="sr-only">체형 선택 방식</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="body-mode"
                checked={value.mode === "auto"}
                onChange={() =>
                  mutation.mutate({ mode: "auto", defaultCharacterId: value.defaultCharacterId })
                }
              />
              자동 추천 (기본)
            </label>
            <p className="text-xs text-text-secondary">
              러프에 맞춰 추천합니다. 추천이 불확실하면 등록한 기본 체형을 사용합니다.
            </p>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="body-mode"
                checked={value.mode === "fixed_default"}
                disabled={!value.defaultCharacterId}
                onChange={() =>
                  mutation.mutate({
                    mode: "fixed_default",
                    defaultCharacterId: value.defaultCharacterId,
                  })
                }
              />
              내 기본 체형으로 시작
            </label>
            <label className="block text-sm">
              내 기본 체형
              <select
                className="ml-3 min-h-11 rounded border border-border bg-surface-0 p-2"
                value={value.defaultCharacterId ?? ""}
                onChange={(e) =>
                  mutation.mutate({ mode: value.mode, defaultCharacterId: e.target.value || null })
                }
              >
                <option value="" disabled={value.mode === "fixed_default"}>
                  지정 안 함
                </option>
                {value.defaultCharacterId &&
                  !options.some((c) => c.characterId === value.defaultCharacterId) && (
                    <option value={value.defaultCharacterId} disabled>
                      기존 체형 · 사용 가능 여부 확인 필요
                    </option>
                  )}
                {options.map((c) => (
                  <option key={c.characterId} value={c.characterId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-text-secondary">
              기본 체형을 등록하는 것만으로 선택 방식이 바뀌지 않습니다. 각 인물은 후보 화면에서
              따로 바꿀 수 있습니다.
            </p>
          </fieldset>
        )}
        {value && (value.shapeEditable?.length ?? 0) > 0 && (
          <ShapeDefaultSection
            editable={value.shapeEditable!}
            saved={value.shapeDefault ?? null}
            busy={busy}
            names={(id) =>
              catalog.data?.characters.find((c) => c.characterId === id)?.displayName ?? id
            }
            onSave={(shapeDefault) =>
              mutation.mutate({
                mode: value.mode,
                defaultCharacterId: value.defaultCharacterId,
                shapeDefault,
              })
            }
          />
        )}
        {(catalog.isError || catalog.data?.origin === "fallback") && (
          <p role="alert">사용 가능한 체형 목록을 확인하지 못했습니다.</p>
        )}
        {mutation.isError && (
          <p role="alert" className="text-brand-coral">
            설정을 저장하지 못했습니다. 현재 값을 확인하고 다시 시도해 주세요.
          </p>
        )}
        {mutation.isSuccess && <p role="status">설정이 저장됐습니다. 다음 작업부터 적용됩니다.</p>}
      </div>
    </AppShell>
  );
}

/**
 * "내 기본값": 후보 화면 체형 조절 바의 "내 기본값" 버튼이 불러오는 수치.
 * 서버가 조절 가능한 체형(`shapeEditable`)을 알려 줄 때만 보인다.
 */
function ShapeDefaultSection({
  editable,
  saved,
  busy,
  names,
  onSave,
}: {
  editable: Array<{ characterId: string; shape: ShapeSpec }>;
  saved: { characterId: string; controls: Record<string, number> } | null;
  busy: boolean;
  names(id: string): string;
  onSave(value: { characterId: string; controls: Record<string, number> } | null): void;
}) {
  const initialId =
    saved && editable.some((e) => e.characterId === saved.characterId)
      ? saved.characterId
      : editable[0].characterId;
  const [characterId, setCharacterId] = useState(initialId);
  const spec = editable.find((e) => e.characterId === characterId)!.shape;
  const base = Object.fromEntries(spec.controls.map((c) => [c.key, c.default]));
  const [values, setValues] = useState<Record<string, number>>(() => ({
    ...base,
    ...(saved?.characterId === characterId ? saved.controls : {}),
  }));
  useEffect(() => {
    // 다른 체형으로 바꾸면 그 체형의 저장값(없으면 기본값)에서 시작한다.
    setValues({
      ...Object.fromEntries(spec.controls.map((c) => [c.key, c.default])),
      ...(saved?.characterId === characterId ? saved.controls : {}),
    });
  }, [characterId, saved, spec]);
  const dirty =
    !saved ||
    saved.characterId !== characterId ||
    spec.controls.some((c) => saved.controls[c.key] !== values[c.key]);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">내 기본 체형 수치</h3>
        <span className="text-xs text-text-secondary">
          {saved ? `저장됨 · ${names(saved.characterId)}` : "저장된 값 없음"}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        자주 쓰는 캐릭터 체형을 저장해 두면 후보 화면의 체형 더보기에서 “내 기본값”으로 한 번에
        불러올 수 있어요.
      </p>
      <label className="block text-sm">
        기준 체형
        <select
          className="ml-3 min-h-11 rounded border border-border bg-surface-0 p-2"
          value={characterId}
          disabled={busy}
          onChange={(e) => setCharacterId(e.target.value)}
        >
          {editable.map((e) => (
            <option key={e.characterId} value={e.characterId}>
              {names(e.characterId)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid max-w-[560px] gap-2">
        {spec.controls.map((c) => (
          <label
            key={c.key}
            className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-2 text-sm"
          >
            <span className="font-semibold">{c.label ?? shapeLabel(c.key)}</span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={values[c.key] ?? c.default}
              disabled={busy}
              onChange={(e) => setValues((v) => ({ ...v, [c.key]: Number(e.target.value) }))}
              className="accent-brand-coral"
            />
            <output className="text-right font-mono text-xs text-text-secondary">
              {formatShapeValue(c, values[c.key] ?? c.default)}
            </output>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !dirty} onClick={() => onSave({ characterId, controls: values })}>
          저장
        </Button>
        <Button variant="ghost" disabled={busy || !saved} onClick={() => onSave(null)}>
          지우기
        </Button>
      </div>
    </section>
  );
}
