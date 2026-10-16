import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { useInstallationStore } from "@/features/installation/installationStore";
import { bodyKeys, getPreferences, putPreferences } from "./api";
import { useBodyOwner } from "./hooks";
import type { BodyPreferences } from "./contract";

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

/**
 * "내 기본값" = 체형 하나 + (조절 가능한 체형이면) 그 수치.
 * 서버에는 두 칸으로 저장된다: `defaultCharacterId`(새 작업을 "내 기본값으로 시작"할 때의 체형)와
 * `shapeDefault`(그 체형의 수치). 앱은 둘을 늘 같은 체형으로 맞춰 저장하고, 예전 값이 어긋나
 * 있으면 수치가 있는 쪽을 내 기본값으로 본다(후보 화면 "내 기본값" 버튼과 같은 규칙).
 */
export type MyDefault = { characterId: string; controls: Record<string, number> | null };
export function myDefaultOf(prefs?: BodyPreferences | null): MyDefault | null {
  if (prefs?.shapeDefault)
    return { characterId: prefs.shapeDefault.characterId, controls: prefs.shapeDefault.controls };
  if (prefs?.defaultCharacterId) return { characterId: prefs.defaultCharacterId, controls: null };
  return null;
}

/** 내 기본값 읽기·저장·지우기. 저장은 다음 작업과 "내 기본값" 버튼에만 영향을 준다. */
export function useMyDefault() {
  const query = useBodyPreferences();
  const owner = useBodyOwner();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (next: MyDefault | null) => {
      const current = query.data ?? (await query.refetch()).data;
      if (!current) throw new Error("preferences missing");
      return putPreferences(
        next
          ? {
              mode: current.mode,
              defaultCharacterId: next.characterId,
              shapeDefault: next.controls
                ? { characterId: next.characterId, controls: next.controls }
                : null,
            }
          : // 지우면 "내 기본값으로 시작"도 쓸 수 없으니 자동 추천으로 돌린다.
            { mode: "auto", defaultCharacterId: null, shapeDefault: null },
        current.revision,
      );
    },
    onSuccess: (value) => {
      if (useInstallationStore.getState().credentials?.installationId === owner)
        qc.setQueryData(bodyKeys.preferences(owner), value);
    },
    // 다른 창에서 먼저 바꿨을 수 있다(revision 충돌). 최신 값을 받아 다시 보여 준다.
    onError: () => void query.refetch(),
  });
  return { query, value: myDefaultOf(query.data), save: mutation };
}
