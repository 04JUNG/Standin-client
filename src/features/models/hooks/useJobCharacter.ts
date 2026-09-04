import { useEffect } from "react";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useModelCatalog } from "./useModelCatalog";
import { useModelStore } from "../store/modelStore";

/**
 * 이 작업이 저장될 모델을 정한다.
 *
 * 흐름을 앱의 미리보기나 바에서 시작하면 그 시점에 `startJob`이 모델을 고정한다. 그런데
 * 작업 기록에서 지난 작업을 열거나(ADR-012) 딥링크로 바로 들어오면 고정된 값이 없다.
 * 그때는 **지금 설정값**을 이 작업에 고정한다 — 캐릭터는 export 파라미터라 지난 작업을
 * 오늘 모델로 다시 저장하는 것이 맞는 동작이고, 저장 화면이 어떤 모델을 썼는지 말한다.
 */
export function useJobCharacter(jobId: string | undefined): string | null {
  const storeJobId = usePoseSelectionStore((s) => s.jobId);
  const pinned = usePoseSelectionStore((s) => s.characterId);
  const setCharacterId = usePoseSelectionStore((s) => s.setCharacterId);
  const preferred = useModelStore((s) => s.preferredCharacterId);
  const { data: catalog } = useModelCatalog();

  const fallback = preferred ?? catalog?.defaultCharacterId ?? null;

  useEffect(() => {
    // 이 훅이 보고 있는 job이 스토어의 현재 job일 때만 손댄다. 화면 전환 도중에
    // 다른 job의 고정값을 덮어쓰면 안 된다.
    if (!jobId || storeJobId !== jobId) return;
    if (pinned !== null || fallback === null) return;
    setCharacterId(fallback);
  }, [jobId, storeJobId, pinned, fallback, setCharacterId]);

  return pinned ?? fallback;
}
