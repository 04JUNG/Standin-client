import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "../api/pose.contract";
import type { RefineOutcome } from "../api/refine.contract";
import { refineService } from "../api/refine.service";
import { usePoseSelectionStore } from "../store/poseSelectionStore";

/** 동시 호출 상한. 다인 컷에서 추론 서버에 한꺼번에 몰리지 않게 한다. */
const MAX_PARALLEL = 3;

export type RefineStatus = "idle" | "running" | "done";

/**
 * 확정한 선택을 러프에 맞춰 조정한다(FE-03).
 *
 * 앱 모드와 바 모드가 **같은 훅**을 쓴다. 여기가 갈리면 같은 job을 어디서 확정했는지에 따라
 * 저장되는 파일이 달라진다.
 *
 * 실패해도 저장 흐름을 멈추지 않는다. refine은 "좋아지거나, 그대로"이지 성공해야만 하는
 * 단계가 아니다. 호출이 실패하면 그 인물은 베이스 후보 URL로 저장된다.
 */
export function useRefineSelection(data: AnalysisResult | undefined) {
  const selectedByPerson = usePoseSelectionStore((s) => s.selectedByPerson);
  const refineByPerson = usePoseSelectionStore((s) => s.refineByPerson);
  const setRefineOutcome = usePoseSelectionStore((s) => s.setRefineOutcome);
  const [status, setStatus] = useState<RefineStatus>("idle");

  // effect가 선택 객체의 정체성 변화마다 재실행되지 않게 최신 값만 참조한다.
  const latest = useRef({ data, selectedByPerson });
  latest.current = { data, selectedByPerson };

  const run = useCallback(async () => {
    const { data: result, selectedByPerson: picks } = latest.current;
    if (!result) return;

    // 서버가 refine을 노출하지 않으면 클라이언트는 호출하지 않는다(OPS-02).
    const targets = result.capabilities.refine
      ? result.people.flatMap((person) => {
          const candidateId = picks[person.index];
          // 저신뢰(soft) 인물은 후보를 고르고 베이스로 저장할 수 있지만 refine은 금지다.
          if (!candidateId || !person.refineAllowed) return [];
          return [{ personIndex: person.index, candidateId }];
        })
      : [];

    if (targets.length === 0) {
      setStatus("done");
      return;
    }

    setStatus("running");
    const queue = [...targets];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          const outcome = await refineService.refineSelection({
            jobId: result.jobId,
            personIndex: next.personIndex,
            candidateId: next.candidateId,
          });
          setRefineOutcome(outcome);
        } catch {
          // 조정에 실패해도 베이스 포즈는 그대로 저장할 수 있다. 결과를 기록하지 않으면
          // 저장 단계가 후보의 원래 bvhUrl을 쓴다 — 그게 정확히 원하는 폴백이다.
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, targets.length) }, worker),
    );
    setStatus("done");
  }, [setRefineOutcome]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !data) return;
    started.current = true;
    void run();
  }, [data, run]);

  const outcomes: RefineOutcome[] = Object.values(refineByPerson);
  return {
    status,
    refineByPerson,
    /** 실제로 조정본이 만들어진 인물 수. 배지 문구를 고를 때 쓴다. */
    appliedCount: outcomes.filter((o) => o.refined).length,
  };
}
