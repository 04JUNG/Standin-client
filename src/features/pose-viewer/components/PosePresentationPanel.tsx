import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchBytes } from "@/shared/api/client";
import type { PosePresentation, PreviewCandidate } from "../api/posePresentation";

const labels: Record<string, string> = {
  ready: "검색 후보 준비",
  review_ready: "검수용 결과",
  basic_reference: "기본 인체 계획",
  no_result: "정상 검색 완료 · 후보 없음",
  generation_failed: "생성 검수 실패",
  partial_error: "일부 검색/미리보기 오류",
  error: "검색/미리보기 오류",
  blocked: "검색 제한",
  undetermined: "판정 보류",
  not_run: "검색 미실행",
};
const generation: Record<string, string> = {
  not_requested: "미실행",
  preview_ready: "검수 후보 준비",
  error: "오류",
  rejected: "검증 탈락",
  timeout: "시간 초과",
  unsupported: "미지원",
  no_result: "정상 완료 · 후보 없음",
};
async function source(candidate: PreviewCandidate, signal: AbortSignal) {
  const url = candidate.asset.preview_bvh_url;
  if (
    !/^\/v1\/analysis\/jobs\/[^/]+\/people\/\d+\/pose-previews\/preview_[a-f0-9]{64}\/[a-f0-9]{64}$/.test(
      url,
    )
  )
    throw Error("미리보기 경로를 확인하지 못했습니다.");
  const bytes = await apiFetchBytes(url, { auth: false, signal });
  if (bytes.length > 2_000_000) throw Error("미리보기 크기를 확인하지 못했습니다.");
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== candidate.asset.bvh_sha256) throw Error("BVH 해시가 변경되었습니다.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function Preview({ candidate, scope }: { candidate: PreviewCandidate; scope: string | null }) {
  const [open, setOpen] = useState(false),
    [turn, setTurn] = useState(0);
  const data = useQuery({
    queryKey: ["pose-bvh-source", candidate.asset.preview_bvh_url],
    queryFn: ({ signal }) => source(candidate, signal),
    retry: false,
    staleTime: 600_000,
    gcTime: 600_000,
  });
  const picture = useQuery({
    queryKey: [
      "pose-bvh-render",
      candidate.asset.preview_bvh_url,
      scope,
      candidate.render_camera,
      open ? turn : 0,
    ],
    enabled: !!data.data,
    queryFn: async () => {
      const { renderBvh } = await import("../preview/bvhPreview");
      return renderBvh(data.data!, scope, candidate.render_camera, open ? turn : 0);
    },
    retry: false,
    staleTime: 600_000,
    gcTime: 60_000,
  });
  const error = data.error || picture.error;
  return (
    <div
      data-presentation-candidate={candidate.candidate_id}
      className="rounded-lg border border-border bg-surface-0 p-2"
    >
      <button
        type="button"
        className="w-full"
        onClick={() => {
          setTurn(0);
          setOpen(true);
        }}
        disabled={!picture.data}
        aria-label={`${candidate.rank}번 ${candidate.kind} 3D 미리보기`}
      >
        {picture.data ? (
          <img
            src={picture.data}
            alt="BVH 관절 기반 3D 미리보기"
            className="aspect-square w-full object-contain"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center text-xs">
            {error ? "3D 미리보기 불가" : "3D 미리보기 준비 중"}
          </div>
        )}
        <span className="text-xs">
          {candidate.rank}.{" "}
          {candidate.kind === "library_match"
            ? "검색 후보"
            : candidate.kind === "generated_review"
              ? "생성 검수"
              : candidate.kind === "near_match"
                ? "근접 참고"
                : "기하·구도 참고"}
        </span>
      </button>
      <p className="text-[11px] text-text-secondary">
        {candidate.render_camera.projection_matches_search ? "검색 카메라" : "참고 카메라"} · 검수용
        · 저장 불가
      </p>
      {error && (
        <button
          type="button"
          className="text-xs"
          onClick={() => {
            void data.refetch();
            void picture.refetch();
          }}
        >
          미리보기 다시 시도
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="포즈 3D 미리보기"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="max-h-[95vh] w-[min(90vw,640px)] overflow-auto rounded-xl bg-surface-0 p-4">
            <p>BVH 관절 기반 3D 미리보기 · 보정·자동 적용·저장 불가</p>
            {picture.data && <img src={picture.data} alt="실제 BVH 3D 자세" className="w-full" />}
            <div className="flex gap-3">
              <button type="button" onClick={() => setTurn((v) => v - 15)}>
                왼쪽 회전
              </button>
              <button type="button" onClick={() => setTurn(0)}>
                기준 시점
              </button>
              <button type="button" onClick={() => setTurn((v) => v + 15)}>
                오른쪽 회전
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <p className="text-xs">
              {turn ? "사용자 회전 시점" : "서버가 제공한 시점"} · 출력 범위: {scope ?? "미확정"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
export function PosePresentationPanel({
  presentation: p,
  compact = false,
}: {
  presentation: PosePresentation;
  compact?: boolean;
}) {
  return (
    <section className="space-y-2" aria-label={`인물 ${p.person_index + 1} 포즈 표시 결과`}>
      <div role="status" className="rounded-lg bg-surface-2 p-2 text-xs">
        <p>
          {labels[p.status] ?? "지원하지 않는 표시 상태"} · 검색: {p.search_status}
        </p>
        {p.search_reason && <p>검색 조건과 근거를 확인해 주세요.</p>}
        {p.generation_status && (
          <p>
            생성: {generation[p.generation_status] ?? "판정 보류"}
            
          </p>
        )}
        {p.basic_model && <p>기본 인체 출력 계획 · 아직 3D 파일이 제공되지 않았습니다.</p>}
        {p.unobserved_body_is_default === true && (
          <p>보이지 않는 신체 부위에는 기본값이 포함되어 있습니다.</p>
        )}
        <p>검수용입니다. 자동 적용·보정·내보내기를 지원하지 않습니다.</p>
        {p.issues.length > 0 && <p>일부 3D 미리보기를 확인하지 못했습니다.</p>}
      </div>
      {(
        [
          ["검색 후보", p.library_candidates],
          ["근접·기하·구도 참고", p.review_candidates],
          ["생성 검수 후보", p.generated_candidates],
        ] as const
      ).map(([label, rows]) => (
        <div key={label}>
          <h3 className="text-xs font-semibold">
            {label} {rows.length}개
          </h3>
          {rows.length > 0 && (
            <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
              {rows.map((c) => (
                <Preview key={c.candidate_id} candidate={c} scope={p.output_scope} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
