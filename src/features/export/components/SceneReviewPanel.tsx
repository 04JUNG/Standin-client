import { SCOPE_LABELS, type BodyScope } from "@/features/pose-viewer/api/outputScope";
import { Button } from "@/shared/components/Button";
import type { SceneReview } from "../api/scene";

export interface SceneComparison {
  originalUrl?: string;
  selected: {
    personIndex: number;
    candidateId: string;
    poseId?: string | null;
    outputScope: BodyScope;
    image?: string;
  }[];
}
export function SceneReviewPanel({
  review,
  confirm,
  cancel,
  original,
  comparison,
}: {
  review: SceneReview;
  confirm: () => void;
  cancel: () => void;
  original?: () => void;
  comparison?: SceneComparison;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">결과 확인</p>
      <p className="text-[12px] text-text-secondary">
        자동 보정으로 포즈·방향·팔 움직임·저장 범위가 달라질 수 있어요. 결과와 변경 내용을 확인해
        주세요.
      </p>
      <details className="text-[12px] text-text-secondary" open>
        <summary>원본과 선택한 포즈</summary>
        {comparison?.originalUrl ? (
          <img
            src={comparison.originalUrl}
            alt="원본 러프"
            className="max-h-48 w-full object-contain"
          />
        ) : (
          <p>원본 이미지를 표시하지 못했어요.</p>
        )}
        {comparison?.selected.map((p) => (
          <div key={p.personIndex} className="mt-2">
            <p>
              인물 {p.personIndex + 1} · {SCOPE_LABELS[p.outputScope]}
            </p>
            {p.image ? (
              <img
                src={p.image}
                alt={`인물 ${p.personIndex + 1} 선택한 포즈`}
                className="max-h-48 w-full object-contain"
              />
            ) : (
              <p>선택한 포즈의 이미지를 표시하지 못했어요.</p>
            )}
          </div>
        ))}
      </details>
      <p className="text-[13px] font-semibold">자동 보정 결과</p>
      {review.previewBase64 ? (
        <img
          src={`data:image/png;base64,${review.previewBase64}`}
          alt="저장할 결과 미리보기"
          className="max-h-[400px] w-full object-contain"
        />
      ) : (
        <p role="status" className="text-[12px] text-text-secondary">
          {review.previewFailed
            ? "미리보기를 표시하지 못했어요. 변경 내용을 확인해 저장하거나 선택한 포즈로 돌아갈 수 있어요."
            : "파일이 준비됐어요. 미리보기를 불러오고 있어요."}
        </p>
      )}
      <ul className="text-[12px] text-text-secondary">
        {review.summary.map((p) => {
          // These are reported final directions, not measured before/after changes.
          const direction = p.direction
            ? [
                p.direction.torso_camera_yaw != null
                  ? `몸 방향 ${p.direction.torso_camera_yaw}°`
                  : null,
                p.direction.head_camera_yaw != null
                  ? `머리 방향 ${p.direction.head_camera_yaw}°`
                  : null,
                p.direction.head_relative_yaw != null
                  ? `몸 대비 고개 돌림 ${p.direction.head_relative_yaw}°`
                  : null,
                p.direction.head_pitch_degrees != null
                  ? `고개 기울기 ${p.direction.head_pitch_degrees}°`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "";
          return (
            <li key={p.personIndex} className="mt-2">
              <p className="font-semibold">인물 {p.personIndex + 1} 변경 내용</p>
              <p>포즈: {p.poseChanged ? "변경됨" : "선택한 포즈 그대로"}</p>
              <p>
                저장 범위:{" "}
                {p.outputScopeChanged
                  ? `${SCOPE_LABELS[p.previousOutputScope]} → ${SCOPE_LABELS[p.outputScope]}`
                  : `${SCOPE_LABELS[p.outputScope]} (그대로)`}
              </p>
              <p>{direction ? `최종 방향: ${direction}` : "방향의 자세한 정보가 없어요."}</p>
              {direction && <p>보정 전 방향과는 비교하기 어려워요.</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-text-secondary">
        확인 가능 시간: {new Date(review.expiresAt).toLocaleString()}
      </p>
      <Button onClick={confirm}>저장</Button>
      {original && (
        <Button variant="secondary" onClick={original}>
          선택한 포즈 그대로 저장
        </Button>
      )}
      <Button variant="secondary" onClick={cancel}>
        취소
      </Button>
    </div>
  );
}
