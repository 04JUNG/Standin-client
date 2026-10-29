import type { SceneManifest } from "../api/sceneMetadata";
import { Button } from "@/shared/components/Button";
import { omissionLabel, type SaveCoverage } from "../lib/saveCoverage";

export function SaveCoveragePanel({
  coverage,
  needsPartialConfirmation,
  needsIndividualConfirmation,
  unavailableReason,
  confirmPartial,
  confirmIndividual,
  returnToSelection,
  saved,
  scene,
  camera,
}: {
  coverage: SaveCoverage;
  needsPartialConfirmation: boolean;
  needsIndividualConfirmation: boolean;
  unavailableReason?: string;
  confirmPartial: () => void;
  confirmIndividual: () => void;
  returnToSelection: () => void;
  saved?: boolean;
  scene?: boolean;
  camera?: SceneManifest["camera"];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-3 text-[12px]">
      <p role="status" className="font-semibold">
        감지 {coverage.detected.length}명 · 저장 {coverage.included.length}명
      </p>
      {coverage.omitted.map((p) => (
        <p key={p.personIndex} className="text-text-secondary">
          인물 {p.personIndex + 1} · {omissionLabel[p.reason]}
        </p>
      ))}
      {needsPartialConfirmation && (
        <>
          <p>일부 인물만 저장할까요?</p>
          <Button disabled={coverage.included.length === 0} onClick={confirmPartial}>
            {coverage.included.length}명만 저장
          </Button>
          <Button variant="secondary" onClick={returnToSelection}>
            후보 다시 확인
          </Button>
        </>
      )}
      {!needsPartialConfirmation && needsIndividualConfirmation && (
        <>
          <p>{unavailableReason}</p>
          <p>인물마다 파일을 따로 저장해요. 러프의 배치는 포함되지 않아요.</p>
          <Button onClick={confirmIndividual}>개별 파일로 저장</Button>
          <Button variant="secondary" onClick={returnToSelection}>
            후보 다시 확인
          </Button>
        </>
      )}
      {saved && !scene && <p>개별 파일 저장 · 러프 배치 제외</p>}
      {saved && scene && (
        <>
          <p>FBX 생성 완료 · 인물 배치 포함</p>
          {camera?.status === "available" && (
            <details>
              <summary>러프 구도에 맞춘 CSP 카메라 설정</summary>
              <p>FBX와 함께 저장한 .scene.json에 같은 파일의 카메라 설정을 담았어요.</p>
              <p>
                원본 화면 {camera.recipe.source_dimensions.join(" × ")}px · 퍼스{" "}
                {camera.recipe.csp.perspective_ui_value}
              </p>
              <p>
                카메라 위치 X·Y·Z:{" "}
                {camera.recipe.csp.camera_position.map((v) => v.toFixed(2)).join(" · ")}
              </p>
              <p>
                주시점 X·Y·Z:{" "}
                {camera.recipe.csp.focal_point_position.map((v) => v.toFixed(2)).join(" · ")}
              </p>
              <p>같은 캔버스 비율에서 사용하고, 가져온 인물의 위치·배율은 유지해 주세요.</p>
            </details>
          )}
          <p className="text-text-secondary">CSP 카메라 적용 필요 · 자동 연결 미지원</p>
          <p className="text-text-secondary">CSP 구도는 아직 검증하지 않았어요.</p>
        </>
      )}
    </div>
  );
}
