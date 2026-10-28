import { SaveCoveragePanel } from "./SaveCoveragePanel";
import { Button } from "@/shared/components/Button";
import type { useSaveFlow } from "../hooks/useSaveFlow";
import { SceneReviewPanel } from "./SceneReviewPanel";

type Flow = ReturnType<typeof useSaveFlow>;
export function SceneSaveControls({
  flow,
  returnToSelection,
}: {
  flow: Flow;
  returnToSelection: () => void;
}) {
  return (
    <>
      <SaveCoveragePanel
        coverage={flow.coverage}
        needsPartialConfirmation={flow.needsPartialConfirmation}
        needsIndividualConfirmation={flow.needsIndividualConfirmation}
        unavailableReason={flow.sceneUnavailableReason}
        confirmPartial={flow.confirmPartial}
        confirmIndividual={flow.confirmIndividual}
        returnToSelection={returnToSelection}
        saved={flow.status === "saved"}
        scene={!!flow.sceneOutputLabel}
      />
      {flow.sceneOutputLabel && (
        <p role="status" className="text-[12px] text-text-secondary">
          {flow.sceneOutputLabel}
        </p>
      )}
      {flow.choosingSceneMode && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">저장 방식 선택</p>
          <p className="text-[12px] text-text-secondary">
            선택한 포즈·체형·손·범위를 유지해 하나의 파일로 저장해요. 인물 배치는 러프를 따라요.
            자동 보정은 포즈·방향·범위까지 바꿀 수 있어 결과 확인이 필요해요.
          </p>
          <Button
            disabled={!flow.canUseOriginal}
            onClick={() => flow.chooseSceneMode("original-selection")}
          >
            선택한 포즈 그대로
          </Button>
          <Button
            variant="secondary"
            disabled={!flow.canAutoCorrect}
            onClick={() => flow.chooseSceneMode("auto-correct-v4")}
          >
            자동 보정
          </Button>
          {!flow.canAutoCorrect && (
            <p className="text-[12px] text-text-secondary">
              이 작업에서는 자동 보정을 사용할 수 없어요.
            </p>
          )}
          <Button variant="ghost" onClick={returnToSelection}>
            돌아가기
          </Button>
        </div>
      )}
      {flow.status === "preparing" && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-[13px] text-text-secondary">
            {flow.sceneMode === "auto-correct-v4" ? "자동 보정 중…" : "파일 준비 중…"}
          </p>
          <p className="text-[11px] text-text-secondary">
            취소하거나 이 화면을 떠나면 파일을 저장하지 않아요. 준비 작업은 계속될 수 있어요.
          </p>
          <Button variant="secondary" onClick={flow.cancelSave}>
            취소
          </Button>
        </div>
      )}
      {flow.sceneReview && (
        <SceneReviewPanel
          review={flow.sceneReview}
          comparison={flow.comparison}
          confirm={flow.confirmScene}
          cancel={flow.cancelScene}
          original={flow.canUseOriginal ? () => void flow.saveOriginalSelection() : undefined}
        />
      )}
      {flow.status === "cancelled" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-[13px]">
            저장을 취소했어요. 선택한 포즈는 그대로예요.
          </p>
          <p className="text-[11px] text-text-secondary">
            준비 작업은 계속될 수 있어요. 다시 시작하면 결과를 새로 확인해 주세요.
          </p>
          <Button onClick={() => void flow.retry()}>다시 시작</Button>
          {flow.canUseOriginal && (
            <Button variant="secondary" onClick={() => void flow.saveOriginalSelection()}>
              선택한 포즈 그대로 저장
            </Button>
          )}
          <Button variant="ghost" onClick={returnToSelection}>
            돌아가기
          </Button>
        </div>
      )}
      {flow.status === "error" && flow.serverOperationMayContinue && (
        <p role="status" className="text-[12px] text-text-secondary">
          기다림은 끝났지만 준비 작업은 계속될 수 있어요. 다시 시작하면 새로 준비할 수 있어요.
        </p>
      )}
      {flow.status === "error" &&
        flow.sceneMode === "auto-correct-v4" &&
        flow.canUseOriginalAfterError && (
          <Button variant="secondary" onClick={() => void flow.saveOriginalSelection()}>
            선택한 포즈 그대로 저장
          </Button>
        )}
    </>
  );
}
