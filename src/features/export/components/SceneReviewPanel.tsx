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
      <p className="text-[15px] font-semibold">최종 보정 장면 확인</p>
      <p className="text-[12px] text-text-secondary">
        기본 포즈·방향·출력 범위와 배치가 바뀔 수 있어요. 아래 서버 변경 내역과 최종 결과를 확인해
        주세요.
      </p>
      <details className="text-[12px] text-text-secondary" open>
        <summary>원본 / 선택 결과</summary>
        {comparison?.originalUrl ? (
          <img
            src={comparison.originalUrl}
            alt="원본 러프"
            className="max-h-48 w-full object-contain"
          />
        ) : (
          <p>원본 이미지를 표시할 수 없어요.</p>
        )}
        {comparison?.selected.map((p) => (
          <div key={p.personIndex} className="mt-2">
            <p>
              인물 {p.personIndex + 1} 선택 결과 · {p.poseId ?? p.candidateId} ·{" "}
              {SCOPE_LABELS[p.outputScope]}
            </p>
            {p.image ? (
              <img
                src={p.image}
                alt={`인물 ${p.personIndex + 1} 보정 전 선택 결과`}
                className="max-h-48 w-full object-contain"
              />
            ) : (
              <p>이 선택의 검증된 비교 이미지를 표시할 수 없어요.</p>
            )}
          </div>
        ))}
      </details>
      <p className="text-[13px] font-semibold">최종 보정 결과</p>
      {review.previewBase64 ? (
        <img
          src={`data:image/png;base64,${review.previewBase64}`}
          alt="최종 FBX의 인물 방향·범위·팔·배치 미리보기"
          className="max-h-[400px] w-full object-contain"
        />
      ) : (
        <p role="status" className="text-[12px] text-text-secondary">
          {review.previewFailed
            ? "최종 미리보기를 표시하지 못했어요. 변경 내역을 확인하고 검증된 파일을 저장하거나 돌아갈 수 있어요."
            : "장면 파일이 준비됐어요. 최종 미리보기를 불러오고 있어요."}
        </p>
      )}
      <ul className="text-[12px] text-text-secondary">
        {review.summary?.map((p) => (
          <li key={p.personIndex} className="mt-2">
            <p className="font-semibold">인물 {p.personIndex + 1} 주요 변경</p>
            <p>
              포즈: {p.previousPoseId ?? "정보 없음"} → {p.poseId ?? "정보 없음"}
              {p.poseChanged ? " (교체)" : " (유지)"}
            </p>
            <p>
              출력 범위: {SCOPE_LABELS[p.previousOutputScope]} → {SCOPE_LABELS[p.outputScope]}
              {p.outputScopeChanged ? " (변경)" : " (유지)"}
            </p>
            <p>
              방향:{" "}
              {p.direction
                ? [
                    p.direction.torso_camera_yaw != null
                      ? `몸통 시점 ${p.direction.torso_camera_yaw}°`
                      : null,
                    p.direction.head_camera_yaw != null
                      ? `머리 시점 ${p.direction.head_camera_yaw}°`
                      : null,
                    p.direction.head_relative_yaw != null
                      ? `몸통 대비 머리 ${p.direction.head_relative_yaw}°`
                      : null,
                    p.direction.head_pitch_degrees != null
                      ? `고개 기울기 ${p.direction.head_pitch_degrees}°`
                      : null,
                    p.direction.torso_label,
                    p.direction.head_label,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "상세 정보 없음"
                : "서버에서 상세 변경 정보를 제공하지 않았어요."}{" "}
              (보정 전 방향 비교 정보 없음)
            </p>
            {p.interaction && (
              <p>
                상호작용:{" "}
                {
                  { preserve: "기존 동작 유지", restraining: "붙잡기", reaching: "팔 뻗기" }[
                    p.interaction
                  ]
                }
              </p>
            )}
            {p.armGoalCount != null && p.armGoalCount > 0 && (
              <p>팔 동작 보정: {p.armGoalCount}곳</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-secondary">
        장면 버전 {review.version} · 확인 버전 {review.reviewVersion}
        <br />
        확인 만료 {new Date(review.expiresAt).toLocaleString()}
      </p>
      <details className="break-all text-[10px] text-text-secondary">
        <summary>검수 파일 SHA-256</summary>
        {review.artifactSha256}
      </details>
      <Button onClick={confirm}>이 장면으로 저장</Button>
      {original && (
        <Button variant="secondary" onClick={original}>
          보정 전 선택 유지로 통합 저장
        </Button>
      )}
      <Button variant="secondary" onClick={cancel}>
        취소
      </Button>
    </div>
  );
}
