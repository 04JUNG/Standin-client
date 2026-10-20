import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyKeys, changeCard, getPreferences, type CardChange } from "./api";
import { useBodyOwner } from "./hooks";
import type { BodyCard, BodyPreferences, ShapeSpec } from "./contract";
import { sameShape } from "./shapeValues";

export function useBodyPreferences() {
  const owner = useBodyOwner();
  return useQuery({
    queryKey: bodyKeys.preferences(owner),
    queryFn: ({ signal }) => getPreferences(signal),
    enabled: !!owner,
    retry: false,
  });
}
export function legacyPreferences(error: unknown) {
  return (
    error instanceof ApiError &&
    ([404, 501].includes(error.status) || error.code === "BODY_SELECTION_DISABLED")
  );
}

/* ------------------------------------------------------------------ 내 체형 카드 */

/** 카드 이름 최대 길이(서버와 같다). */
export const CARD_NAME_MAX = 24;

/** 과거 설정의 카드 변환은 서버의 저장 경계에서 수행한다. */
export function cardsOf(prefs?: BodyPreferences | null): BodyCard[] {
  return prefs?.cards ?? [];
}

/** 새 카드의 처음 이름: 쓰지 않은 "주인공 A", "주인공 B", … */
export function nextCardName(cards: readonly Pick<BodyCard, "name">[]) {
  const taken = new Set(cards.map((c) => c.name.trim()));
  for (let i = 0; i < 26; i++) {
    const name = `주인공 ${String.fromCharCode(65 + i)}`;
    if (!taken.has(name)) return name;
  }
  return `주인공 ${cards.length + 1}`;
}

/** 카드 이름 다듬기. 비었거나 너무 길면 null(서버도 같은 규칙으로 거절한다). */
export function cleanCardName(raw: string) {
  const name = raw.trim();
  return name && [...name].length <= CARD_NAME_MAX ? name : null;
}

/**
 * 이 인물의 지금 체형과 같은 카드. 체형과 수치가 모두 같아야 한다.
 * 수치를 처음 값 그대로 둔 체형(shape 없음)은 spec이 있어야 비교할 수 있다.
 */
export function matchCard(
  cards: readonly BodyCard[],
  characterId: string | undefined,
  controls: Record<string, number> | null | undefined,
  spec?: ShapeSpec,
) {
  if (!characterId) return undefined;
  return cards.find(
    (card) =>
      card.characterId === characterId &&
      (spec
        ? sameShape(spec, card.controls, controls)
        : !!controls &&
          Object.entries(card.controls).every(
            ([key, value]) => Math.abs((controls[key] ?? NaN) - value) < 1e-6,
          )),
  );
}

/** 카드 읽기·추가·이름 변경·수치 변경·삭제. 저장이 끝나면 설정 캐시를 서버 값으로 바꾼다. */
export function useBodyCards() {
  const query = useBodyPreferences();
  const owner = useBodyOwner();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (change: CardChange) => {
      const current = query.data ?? (await query.refetch()).data;
      if (!current) throw new Error("preferences missing");
      return changeCard(change, current.revision);
    },
    onSuccess: (value) => {
      if (useInstallationStore.getState().credentials?.installationId === owner)
        qc.setQueryData(bodyKeys.preferences(owner), value);
    },
    // 다른 창에서 먼저 바꿨을 수 있다(revision 충돌). 최신 값을 받아 다시 보여 준다.
    onError: () => void query.refetch(),
  });
  return {
    query,
    cards: cardsOf(query.data),
    /** 카드를 지원하는 BFF인가. 아니면 만들기·고치기를 막는다. */
    supported: !!query.data?.cards,
    change: mutation,
  };
}
