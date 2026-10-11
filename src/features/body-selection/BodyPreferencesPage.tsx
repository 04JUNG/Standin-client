import { useInstallationStore } from "@/features/installation/installationStore";
import { useBodyPreferences } from "./preferences";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { useModelCatalog } from "@/features/models/hooks/useModelCatalog";
import { ModelPreview } from "@/features/models/components/ModelPreview";
import { bodyKeys, putPreferences } from "./api";
import { useBodyOwner } from "./hooks";
export function BodyPreferencesPage() {
  const query = useBodyPreferences(),
    owner = useBodyOwner(),
    qc = useQueryClient(),
    catalog = useModelCatalog();
  const mutation = useMutation({
    mutationFn: (change: { mode: "auto" | "fixed_default"; defaultCharacterId: string | null }) => {
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
            <div>
              <p className="mb-2 text-sm font-semibold">내 기본 체형</p>
              {value.defaultCharacterId &&
                !options.some((c) => c.characterId === value.defaultCharacterId) && (
                  <p role="status" className="mb-2 text-xs text-text-secondary">
                    기존 체형의 사용 가능 여부를 확인할 수 없습니다.
                  </p>
                )}
              <div role="radiogroup" aria-label="내 기본 체형" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {options.map((character) => (
                  <button
                    key={character.characterId}
                    type="button"
                    role="radio"
                    aria-checked={value.defaultCharacterId === character.characterId}
                    onClick={() =>
                      mutation.mutate({ mode: value.mode, defaultCharacterId: character.characterId })
                    }
                    className={`rounded-xl border-2 bg-surface-0 p-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky ${value.defaultCharacterId === character.characterId ? "border-brand-sky" : "border-border"}`}
                  >
                    <ModelPreview character={character} className="h-36 w-full" />
                    <span className="mt-2 block font-semibold">{character.displayName}</span>
                  </button>
                ))}
              </div>
              {value.mode === "auto" && value.defaultCharacterId && (
                <Button
                  variant="ghost"
                  onClick={() => mutation.mutate({ mode: "auto", defaultCharacterId: null })}
                >
                  기본 체형 지정 해제
                </Button>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              기본 체형을 등록하는 것만으로 선택 방식이 바뀌지 않습니다. 각 인물은 후보 화면에서
              따로 바꿀 수 있습니다.
            </p>
          </fieldset>
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
