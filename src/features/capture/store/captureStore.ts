import { create } from "zustand";
import type { FlowOrigin } from "@/features/bar/lib/flowOrigin";
import type { ScreenFrame } from "../api/capture.contract";

/** 캡처 진행 상태(docs/09 §3). command 호출은 service에 두고 store는 orchestration만. */
export type CaptureStatus = "idle" | "grabbing" | "selecting" | "processing" | "error";

type CaptureState = {
  status: CaptureStatus;
  frame: ScreenFrame | null;
  error: string | null;
  /** 캡처를 시작한 곳. 오버레이가 끝난 뒤 어디로 돌아갈지 결정한다(ADR-008). */
  origin: FlowOrigin;
  setStatus(status: CaptureStatus): void;
  setFrame(frame: ScreenFrame | null): void;
  setError(error: string | null): void;
  setOrigin(origin: FlowOrigin): void;
  reset(): void;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  status: "idle",
  frame: null,
  error: null,
  origin: "app",
  setStatus: (status) => set({ status }),
  setFrame: (frame) => set({ frame }),
  setError: (error) => set({ error }),
  setOrigin: (origin) => set({ origin }),
  // origin은 유지한다. 다음 캡처 시작 시 새로 지정되고, 취소 복귀 경로 계산에도 쓰인다.
  reset: () => set({ status: "idle", frame: null, error: null }),
}));
