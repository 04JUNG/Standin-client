import { create } from "zustand";
import type { FlowOrigin } from "@/features/bar/lib/flowOrigin";
import type { CaptureErrorCode, ScreenFrame } from "../api/capture.contract";

/** 캡처 진행 상태(docs/09 §3). command 호출은 service에 두고 store는 orchestration만. */
export type CaptureStatus = "idle" | "grabbing" | "selecting" | "processing" | "error";

type CaptureState = {
  status: CaptureStatus;
  frame: ScreenFrame | null;
  error: string | null;
  /** 마지막 오류의 코드. 화면이 복구 동작(권한 설정 열기)을 붙일지 판단하는 데 쓴다. */
  errorCode: CaptureErrorCode | null;
  /** 캡처를 시작한 곳. 오버레이가 끝난 뒤 어디로 돌아갈지 결정한다(ADR-008). */
  origin: FlowOrigin;
  setStatus(status: CaptureStatus): void;
  setFrame(frame: ScreenFrame | null): void;
  setError(error: string | null, code?: CaptureErrorCode | null): void;
  setOrigin(origin: FlowOrigin): void;
  reset(): void;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  status: "idle",
  frame: null,
  error: null,
  errorCode: null,
  origin: "app",
  setStatus: (status) => set({ status }),
  setFrame: (frame) => set({ frame }),
  setError: (error, code = null) => set({ error, errorCode: error ? code : null }),
  setOrigin: (origin) => set({ origin }),
  // origin은 유지한다. 다음 캡처 시작 시 새로 지정되고, 취소 복귀 경로 계산에도 쓰인다.
  reset: () => set({ status: "idle", frame: null, error: null, errorCode: null }),
}));
