import { AlertCircle, Info, Loader2 } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { toAppError } from "@/shared/api/errors";
import { ModelCard } from "../components/ModelCard";
import { useSelectedModel } from "../hooks/useSelectedModel";
import type { ModelCharacter, ModelSource } from "../api/models.contract";

const SECTION_TITLE: Record<ModelSource, string> = {
  builtin: "기본 모델",
  store: "에셋 스토어",
  user: "내 모델",
};

/** 화면에 나올 순서. 나중 확장이 이 배열에 한 줄 더하는 일로 끝나게 둔다. */
const SECTION_ORDER: ModelSource[] = ["builtin", "user", "store"];

/**
 * 모델 화면(ADR-013).
 *
 * 여기서 고르는 값은 **기본 모델**이다 — 다음에 넣는 러프부터 이 체형으로 저장된다.
 * 이미 진행 중인 작업은 시작할 때 고정된 모델을 그대로 쓴다.
 */
export function ModelsPage() {
  const { catalog, characters, isPending, isError, error, refetch, selectedId, select } =
    useSelectedModel();

  return (
    <AppShell title="모델">
      <div className="mx-auto max-w-[880px]">
        <h2 className="text-[22px] font-bold text-text-primary">어떤 체형으로 저장할까요?</h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          러프를 3D 포즈로 바꿀 때 쓸 체형입니다. 여기서 고른 모델로 포즈 파일이 만들어집니다.
        </p>

        {catalog?.origin === "fallback" && (
          <p
            role="status"
            className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface-0 p-3 text-[13px] text-text-secondary"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            지금 연결된 서버는 모델 선택을 아직 제공하지 않습니다. 당분간 기본 남성 모델로
            저장됩니다.
          </p>
        )}

        {isPending ? (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-brand-sky" aria-hidden />
            <span className="sr-only">모델 목록을 불러오는 중</span>
          </div>
        ) : isError ? (
          <div role="alert" className="mt-8 flex flex-col items-center gap-3">
            <p className="flex items-center gap-2 text-[14px] text-text-secondary">
              <AlertCircle className="h-4 w-4 shrink-0 text-brand-coral" aria-hidden />
              {toAppError(error).message}
            </p>
            <Button variant="secondary" size="md" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : (
          SECTION_ORDER.map((source) => {
            const items = characters.filter((item) => item.source === source);
            if (items.length === 0) return null;
            return (
              <ModelSection
                key={source}
                title={SECTION_TITLE[source]}
                characters={items}
                selectedId={selectedId}
                onSelect={select}
              />
            );
          })
        )}

        <p className="mt-8 text-[13px] text-text-secondary">
          에셋 스토어, 모델 불러오기, 체형 수정은 후속 스프린트에서 연결됩니다.
        </p>
      </div>
    </AppShell>
  );
}

function ModelSection({
  title,
  characters,
  selectedId,
  onSelect,
}: {
  title: string;
  characters: ModelCharacter[];
  selectedId: string | null;
  onSelect(characterId: string): void;
}) {
  return (
    <section className="mt-6">
      <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
      <div
        role="radiogroup"
        aria-label={title}
        className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3"
      >
        {characters.map((character) => (
          <ModelCard
            key={character.characterId}
            character={character}
            selected={character.characterId === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
