import { create } from "zustand";
import type { RefineOutcome } from "../api/refine.contract";

/**
 * 후보 선택 상태(docs/09 §4). 서버 상태(AnalysisResult)와 분리해서 관리한다.
 * 한 컷에 인물이 여러 명일 수 있어 인물 index별로 선택을 따로 관리한다.
 * 새 Job이 열리면 이전 선택을 초기화한다.
 */
type PoseSelectionState = {
  jobId: string | null;
  serverJobId: string | null;
  selectedByPerson: Record<number, string>;
  /**
   * 선택 확정 후 받은 refine 결과. 저장 단계가 여기서 최종 다운로드 URL을 읽는다 —
   * 사용자가 미리보기에서 확인한 포즈와 실제로 저장되는 파일이 달라지면 안 된다.
   */
  refineByPerson: Record<number, RefineOutcome>;
  setJobId(jobId: string): void;
  setServerJobId(jobId: string): void;
  selectCandidate(personIndex: number, candidateId: string): void;
  setRefineOutcome(outcome: RefineOutcome): void;
  restoreSelections(jobId: string, selectedByPerson: Record<number, string>): void;
  clearSelection(): void;
};

export const usePoseSelectionStore = create<PoseSelectionState>((set, get) => ({
  jobId: null,
  serverJobId: null,
  selectedByPerson: {},
  refineByPerson: {},
  setJobId(jobId) {
    if (get().jobId !== jobId) {
      set({ jobId, serverJobId: null, selectedByPerson: {}, refineByPerson: {} });
    }
  },
  setServerJobId(serverJobId) {
    if (get().serverJobId !== serverJobId) {
      // 같은 화면 키에서 서버 분석 결과가 바뀌더라도 이전 job의 조정본을 섞지 않는다.
      set({ serverJobId, refineByPerson: {} });
    }
  },
  selectCandidate(personIndex, candidateId) {
    set((state) => {
      // 후보를 바꾸면 이전 후보의 조정 결과는 더 이상 이 선택의 것이 아니다.
      // 남겨 두면 저장 단계가 고르지 않은 포즈의 exportUrl을 내려받는다.
      const refineByPerson = { ...state.refineByPerson };
      delete refineByPerson[personIndex];
      return {
        selectedByPerson: { ...state.selectedByPerson, [personIndex]: candidateId },
        refineByPerson,
      };
    });
  },
  /**
   * 작업 기록에서 연 작업의 지난 선택을 되살린다.
   *
   * `setRefineOutcome`과 같은 이유로 job을 확인한다 — 화면을 떠난 뒤 늦게 도착한 응답이
   * 다음 job의 선택을 덮어쓰면 안 된다. 이미 고른 것이 있으면 손대지 않는다: 사용자가
   * 응답을 기다리는 사이에 후보를 바꿨다면 그 선택이 우선이다.
   */
  restoreSelections(jobId, selectedByPerson) {
    set((state) => {
      if (state.jobId !== jobId) return state;
      if (Object.keys(state.selectedByPerson).length > 0) return state;
      return { selectedByPerson };
    });
  },
  setRefineOutcome(outcome) {
    set((state) => {
      // 화면을 떠난 뒤 늦게 도착한 응답은 새 job/새 후보의 저장 대상을 덮어쓰면 안 된다.
      if (
        state.serverJobId !== outcome.jobId ||
        state.selectedByPerson[outcome.personIndex] !== outcome.candidateId
      ) {
        return state;
      }
      return {
        refineByPerson: { ...state.refineByPerson, [outcome.personIndex]: outcome },
      };
    });
  },
  clearSelection() {
    set({ selectedByPerson: {}, refineByPerson: {} });
  },
}));
