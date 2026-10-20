import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { useCaptureStore } from "@/features/capture/store/captureStore";
import { useUploadStore } from "@/features/upload/store/uploadStore";
import { useExportStore } from "@/features/export/store/exportStore";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { beginWork, useWorkActivityStore } from "@/shared/stores/workActivityStore";
import { updateBlockReason } from "./useUpdateBlockReason";

beforeEach(() => {
  useCaptureStore.getState().reset();
  useUploadStore.getState().clearDraft();
  useExportStore.getState().reset();
  usePoseSelectionStore.getState().clearSelection();
  useWorkActivityStore.setState({ count: 0 });
});

describe("update work guard", () => {
  it("캡처와 저장 중에는 설치하지 않는다", () => {
    const client = new QueryClient();
    useCaptureStore.setState({ status: "selecting" });
    expect(updateBlockReason(client)).toContain("캡처");
    useCaptureStore.getState().reset();
    useExportStore.setState({ status: "saving" });
    expect(updateBlockReason(client)).toContain("저장 중");
  });
  it("페이지가 사라져도 진행 중인 보정 작업을 보호한다", () => {
    const finish = beginWork();
    expect(updateBlockReason(new QueryClient())).toContain("보정");
    finish();
    finish();
    expect(updateBlockReason(new QueryClient())).toBeNull();
  });
  it("이전 저장 결과로 현재 선택을 저장했다고 판단하지 않고 작업 종료까지 보호한다", () => {
    usePoseSelectionStore.setState({ jobId: "job", selectedByPerson: { 0: "pose" } });
    expect(updateBlockReason(new QueryClient())).toContain("저장하지 않은");
    useExportStore.setState({ jobId: "job", status: "saved", savedPaths: ["pose.fbx"] });
    expect(updateBlockReason(new QueryClient())).toContain("새 장면");
    usePoseSelectionStore.getState().clearSelection();
    expect(updateBlockReason(new QueryClient())).toBeNull();
  });
});
