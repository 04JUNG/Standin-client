import { create } from "zustand";
import type { ScreenFrame } from "../api/capture.contract";

/** 캡처 진행 상태(docs/09 §3). command 호출은 service에 두고 store는 orchestration만. */
export type CaptureStatus = "idle" | "grabbing" | "selecting" | "processing" | "error";

type CaptureState = {
  status: CaptureStatus;
  frame: ScreenFrame | null;
  error: string | null;
  setStatus(status: CaptureStatus): void;
  setFrame(frame: ScreenFrame | null): void;
  setError(error: string | null): void;
  reset(): void;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  status: "idle",
  frame: null,
  error: null,
  setStatus: (status) => set({ status }),
  setFrame: (frame) => set({ frame }),
  setError: (error) => set({ error }),
  reset: () => set({ status: "idle", frame: null, error: null }),
}));
