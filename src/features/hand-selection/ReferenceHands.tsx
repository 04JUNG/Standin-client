import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AnalysisResult } from "@/features/pose-viewer/api/pose.contract";
import { apiFetchResponse } from "@/shared/api/client";
import { blobToDataUrl } from "@/features/pose-viewer/api/thumbnails";
import { Button } from "@/shared/components/Button";
import { useInstallationStore } from "@/features/installation/installationStore";
import { readOutputScope } from "@/features/pose-viewer/api/outputScope";
import { useHands } from "./hooks";
import { HandChips } from "./HandChips";

/** Hand preview is lookup-only and never promotes a review-only pose. */
export function ReferenceHands({
  result,
  personIndex,
}: {
  result: AnalysisResult;
  personIndex: number;
}) {
  const state = useHands(result, [personIndex], true);
  const owner = useInstallationStore((s) => s.credentials?.installationId ?? "");
  const [candidateId, setCandidateId] = useState("");
  const [requested, setRequested] = useState("");
  const person = result.people.find((p) => p.index === personIndex);
  const p = person?.posePresentation;
  const scope = person?.outputScope
    ? readOutputScope(person.outputScope).resolved
    : p?.output_scope;
  const groups = p ? [p.library_candidates, p.review_candidates, p.generated_candidates] : [];
  const candidates = groups.flat();
  const candidate = candidates.find((c) => c.candidate_id === candidateId);
  const hand = state.entries.find((e) => e.personIndex === personIndex)?.selection;
  const binding = JSON.stringify([
    owner,
    candidate?.asset.preview_bvh_url,
    hand?.revision,
    hand?.library_sha256,
    scope,
    candidate?.render_camera,
  ]);
  const preview = useQuery({
    queryKey: ["hands", owner, "pose-preview", binding],
    enabled: !!candidate && !!hand && state.ready && requested === binding,
    queryFn: async ({ signal }) => {
      const response = await apiFetchResponse(
        `${candidate!.asset.preview_bvh_url}/hands?revision=${hand!.revision}`,
        { auth: false, signal },
      );
      if (
        response.headers.get("Content-Type")?.split(";")[0] !== "image/png" ||
        (response.headers.has("X-Standin-Output-Scope") &&
          response.headers.get("X-Standin-Output-Scope") !== scope) ||
        response.headers.get("X-Standin-Preview-Only") !== "true" ||
        response.headers.get("X-Standin-Hand-Revision") !== String(hand!.revision) ||
        response.headers.get("X-Standin-Hand-Library-SHA256") !== hand!.library_sha256
      )
        throw Error("손 미리보기 버전을 확인하지 못했습니다.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.length > 20_000_000 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
      )
        throw Error("손 미리보기 형식을 확인하지 못했습니다.");
      return blobToDataUrl(new Blob([bytes], { type: "image/png" }));
    },
    retry: false,
    staleTime: 300_000,
    gcTime: 60_000,
  });
  if (!state.enabled) return null;
  return (
    <section className="rounded-xl border border-border bg-surface-0 p-3">
      <h3 className="text-sm font-semibold">손 모양 참고 선택</h3>
      <p className="text-xs text-text-secondary">
        원본 BVH 관절 미리보기는 유지됩니다. 선택한 손은 아래 기본 체형·정면 참고 렌더에서 확인할 수
        있습니다. 보정·자동 적용·내보내기는 제한됩니다.
      </p>
      <HandChips state={state} personIndex={personIndex} />
      {!!candidates.length && (
        <div className="flex flex-col gap-2">
          <label className="text-sm">
            손을 확인할 후보
            <select
              aria-label="손 미리보기 후보"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="ml-2 rounded border border-border bg-surface-0 p-2"
            >
              <option value="">후보 선택</option>
              {groups.flatMap((list, g) =>
                list.map((c) => (
                  <option key={c.candidate_id} value={c.candidate_id}>
                    {["검색 후보", "참고 후보", "생성 검수 후보"][g]} {c.rank}
                  </option>
                )),
              )}
            </select>
          </label>
          <Button
            disabled={!candidate || !hand || !state.ready || preview.isFetching}
            onClick={() => {
              setRequested(binding);
              if (requested === binding) void preview.refetch();
            }}
          >
            {preview.isFetching ? "손 적용 미리보기 준비 중…" : "손 적용 미리보기"}
          </Button>
          {requested === binding && preview.error && (
            <p role="alert">
              손 미리보기를 불러오지 못했습니다. 선택을 확인하고 다시 시도해 주세요.
            </p>
          )}
          {state.ready && requested === binding && preview.data && (
            <img
              src={preview.data}
              alt="선택한 손이 적용된 기본 체형의 정면 참고 미리보기"
              className="mx-auto max-h-[480px] max-w-full"
            />
          )}
          <p className="text-xs text-text-secondary">
            조회 전용 이미지입니다. 출력 범위 밖의 손은 보이지 않을 수 있습니다.
          </p>
        </div>
      )}
    </section>
  );
}
