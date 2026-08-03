import { create } from "zustand";

/**
 * 후보 선택 상태(docs/09 §4). 서버 상태(AnalysisResult)와 분리해서 관리한다.
 * 한 컷에 인물이 여러 명일 수 있어 인물 index별로 선택을 따로 관리한다.
 * 새 Job이 열리면 이전 선택을 초기화한다.
 */
type PoseSelectionState = {
  jobId: string | null;
  serverJobId: string | null;
  selectedByPerson: Record<number, string>;
  setJobId(jobId: string): void;
  setServerJobId(jobId: string): void;
  selectCandidate(personIndex: number, candidateId: string): void;
  clearSelection(): void;
};

export const usePoseSelectionStore = create<PoseSelectionState>((set, get) => ({
  jobId: null,
  serverJobId: null,
  selectedByPerson: {},
  setJobId(jobId) {
    if (get().jobId !== jobId) {
      set({ jobId, serverJobId: null, selectedByPerson: {} });
    }
  },
  setServerJobId(serverJobId) {
    set({ serverJobId });
  },
  selectCandidate(personIndex, candidateId) {
    set((state) => ({ selectedByPerson: { ...state.selectedByPerson, [personIndex]: candidateId } }));
  },
  clearSelection() {
    set({ selectedByPerson: {} });
  },
}));
