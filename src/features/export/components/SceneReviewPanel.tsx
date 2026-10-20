import { SCOPE_LABELS, type BodyScope } from "@/features/pose-viewer/api/outputScope";
import { Button } from "@/shared/components/Button";
import type { SceneReview } from "../api/scene";
export function SceneReviewPanel({
  review,
  confirm,
  cancel,
}: {
  review: SceneReview;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">보정된 장면 확인</p>
      {review.previewBase64 ? (
        <img
          src={`data:image/png;base64,${review.previewBase64}`}
          alt="최종 FBX의 인물 방향·범위·팔·배치 미리보기"
          className="max-h-[400px] w-full object-contain"
        />
      ) : (
        <p role="status" className="text-[12px] text-text-secondary">
          {review.previewFailed
            ? "미리보기를 표시하지 못했어요. 검증된 장면은 다운로드할 수 있어요."
            : "장면 파일이 준비됐어요. 미리보기는 이어서 표시돼요."}
        </p>
      )}
      <p className="text-[13px] text-text-secondary">
        러프에 맞춰 방향·출력 범위·팔 동작·인물 배치를 보정했습니다. 이 장면으로 저장할지 확인해
        주세요.
      </p>
      {!!review.summary?.length && (
        <ul className="text-[12px] text-text-secondary">
          {review.summary.map((person) => (
            <li key={person.personIndex}>
              인물 {person.personIndex + 1} ·{" "}
              {SCOPE_LABELS[person.outputScope as BodyScope] ?? "선택한 범위"}
              {person.poseId && person.previousPoseId && person.poseId !== person.previousPoseId
                ? " · 포즈 교체"
                : ""}
              {person.armGoalCount > 0 ? ` · 팔 동작 ${person.armGoalCount}곳 보정` : ""}
            </li>
          ))}
        </ul>
      )}
      <Button onClick={confirm}>이 장면 다운로드</Button>
      <Button variant="secondary" onClick={cancel}>
        취소
      </Button>
    </div>
  );
}
