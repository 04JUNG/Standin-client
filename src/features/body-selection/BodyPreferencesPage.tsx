import { useInstallationStore } from "@/features/installation/installationStore";
import { myDefaultOf, useBodyPreferences } from "./preferences";
import { MyDefaultEditor } from "./MyDefaultEditor";
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
    mutationFn: (mode: "auto" | "fixed_default") => {
      if (!query.data) throw new Error("preferences missing");
      return putPreferences(
        { mode, defaultCharacterId: query.data.defaultCharacterId },
        query.data.revision,
      );
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
  const mine = myDefaultOf(value);
  const mineName = mine
    ? (value?.shapeEditable?.find((e) => e.characterId === mine.characterId)?.displayName ??
      catalog.data?.characters.find((c) => c.characterId === mine.characterId)?.displayName ??
      mine.characterId)
    : null;
  return (
    <AppShell title="체형 기본 설정">
      <div className="mx-auto max-w-[880px] space-y-5">
        {query.isPending && <p role="status">체형 설정을 불러오는 중…</p>}
        {query.isError && (
          <div role="alert">
            <p>체형 설정을 불러오지 못했습니다.</p>
            <Button onClick={() => void query.refetch()}>다시 시도</Button>
          </div>
        )}

        <MyDefaultEditor />

        {value && (
          <section className="space-y-3 rounded-xl border border-border bg-surface-0 p-4">
            <h3 className="text-base font-bold">새 작업을 시작할 때</h3>
            <p className="text-xs text-text-secondary">
              다음 분석부터 적용됩니다. 진행 중인 인물의 체형은 바뀌지 않고, 각 인물은 후보 화면에서
              따로 바꿀 수 있습니다.
            </p>
            <fieldset disabled={busy} className="space-y-2">
              <legend className="sr-only">체형 선택 방식</legend>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="radio"
                  name="body-mode"
                  className="mt-1"
                  checked={value.mode === "auto"}
                  onChange={() => mutation.mutate("auto")}
                />
                <span>
                  <span className="block text-sm font-semibold">자동 추천 (기본)</span>
                  <span className="block text-xs text-text-secondary">
                    러프에 맞춰 추천합니다. 추천이 불확실하면 내 기본값의 체형을 씁니다.
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="radio"
                  name="body-mode"
                  className="mt-1"
                  checked={value.mode === "fixed_default"}
                  disabled={!value.defaultCharacterId}
                  onChange={() => mutation.mutate("fixed_default")}
                />
                <span>
                  <span className="block text-sm font-semibold">
                    내 기본값으로 시작{mineName ? ` · ${mineName}` : ""}
                  </span>
                  <span className="block text-xs text-text-secondary">
                    {value.defaultCharacterId
                      ? "모든 인물이 내 기본값의 체형으로 시작합니다. 수치는 후보 화면에서 ‘내 기본값’을 눌러 불러옵니다."
                      : "먼저 위에서 내 기본값을 저장하세요."}
                  </span>
                </span>
              </label>
            </fieldset>
          </section>
        )}
        {(catalog.isError || catalog.data?.origin === "fallback") && (
          <p role="alert" className="text-xs text-text-secondary">
            사용 가능한 체형 목록을 확인하지 못했습니다.
          </p>
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
