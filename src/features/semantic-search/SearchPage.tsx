import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { AppShell } from "@/shared/components/AppShell";
import { Button } from "@/shared/components/Button";
import { messageOf } from "@/shared/api/errors";
import { usePoseSelectionStore } from "@/features/pose-viewer/store/poseSelectionStore";
import { useModelStore } from "@/features/models/store/modelStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { searchCapabilities, searchPoses } from "./api";

const EXAMPLES = [
  "야구공을 던지는 자세",
  "의자에 앉아 책을 읽는 사람",
  "두 팔을 머리 위로 올린 자세",
];
export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial: unknown = location.state;
  const [query, setQuery] = useState(() =>
    initial &&
    typeof initial === "object" &&
    "query" in initial &&
    typeof initial.query === "string"
      ? initial.query.slice(0, 500)
      : "",
  );
  const [noResult, setNoResult] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const owner = useInstallationStore((s) => s.credentials?.installationId);
  const availability = useQuery({
    queryKey: ["semantic-capabilities", owner],
    queryFn: ({ signal }) => searchCapabilities(signal),
    retry: false,
    staleTime: 30_000,
  });
  const search = useMutation({
    mutationFn: ({
      text,
      signal,
      topK,
    }: {
      text: string;
      signal: AbortSignal;
      generation: number;
      topK: number;
    }) => searchPoses(text, signal, topK),
    onSuccess: (result, variables) => {
      if (variables.generation !== generation.current || variables.signal.aborted) return;
      if (result.status === "no_result") {
        setNoResult(true);
        return;
      }
      usePoseSelectionStore
        .getState()
        .startJob(result.jobId, useModelStore.getState().preferredCharacterId);
      navigate(`/app/jobs/${result.jobId}`);
    },
    retry: false,
  });
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function edit(text: string) {
    generation.current++;
    controller.current?.abort();
    search.reset();
    setNoResult(false);
    setQuery(text);
  }
  const pending = search.isPending && search.variables?.generation === generation.current;
  function submit() {
    if (
      !query.trim() ||
      query.trim().length > 500 ||
      availability.data?.available !== true ||
      pending
    )
      return;
    controller.current?.abort();
    controller.current = new AbortController();
    generation.current++;
    setNoResult(false);
    search.mutate({
      text: query,
      topK: availability.data.maxTopK,
      signal: controller.current.signal,
      generation: generation.current,
    });
  }
  return (
    <AppShell title="문장으로 포즈 찾기">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <div>
          <h2 className="text-[22px] font-bold text-text-primary">찾고 싶은 자세를 적어주세요</h2>
          <p className="mt-2 text-[14px] text-text-secondary">
            동작과 팔·다리의 방향을 구체적으로 쓰면 후보를 고르기 쉬워요.
          </p>
          {availability.data?.available && (
            <p className="mt-2 text-[13px] text-text-secondary">
              최대 {availability.data.maxTopK}개의 검색 후보를 5개씩 비교할 수 있어요.
            </p>
          )}
        </div>
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface-0 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="pose-query" className="text-[14px] font-semibold text-text-primary">
            어떤 포즈를 찾으세요?
          </label>
          <textarea
            id="pose-query"
            value={query}
            maxLength={500}
            rows={4}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="예: 왼팔을 앞으로 뻗고 오른손을 허리에 올린 자세"
            className="w-full resize-y rounded-lg border border-border bg-surface-1 p-3 text-[14px] text-text-primary outline-none focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/30"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-text-secondary">
              {query.length}/500 · Shift+Enter로 줄바꿈
            </span>
            <Button
              type="submit"
              disabled={!query.trim() || pending || availability.data?.available !== true}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              {pending ? "포즈 찾는 중…" : "포즈 찾기"}
            </Button>
          </div>
          {pending && (
            <p role="status" className="text-[13px] text-text-secondary">
              문장에 가까운 포즈를 찾고 있습니다. 검색어를 바꾸면 이전 요청은 취소됩니다.
            </p>
          )}
        </form>
        <div className="flex flex-wrap gap-2" aria-label="검색 예시">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => edit(example)}
              className="rounded-full border border-border px-3 py-2 text-[12px] text-text-secondary hover:border-brand-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky"
            >
              {example}
            </button>
          ))}
        </div>
        {availability.isPending ? (
          <p role="status" className="text-[13px] text-text-secondary">
            검색 서비스 확인 중…
          </p>
        ) : availability.isError || !availability.data?.available ? (
          <div
            role="alert"
            className="rounded-lg border border-border p-4 text-[13px] text-text-secondary"
          >
            <p>지금은 문장 검색을 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.</p>
            <Button variant="ghost" onClick={() => void availability.refetch()}>
              다시 확인
            </Button>
          </div>
        ) : null}
        {search.isError && (
          <p role="alert" className="text-[13px] text-brand-coral">
            {messageOf(search.error, "검색에 실패했습니다. 잠시 후 다시 시도해 주세요.")}
          </p>
        )}
        {noResult && (
          <div role="status" className="rounded-xl border border-border bg-surface-0 p-5">
            <h3 className="text-[16px] font-semibold text-text-primary">
              조건에 맞는 후보를 찾지 못했어요
            </h3>
            <p className="mt-2 text-[14px] text-text-secondary">
              동작 하나와 팔·다리 방향을 중심으로 문장을 짧게 바꿔보세요.
            </p>
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-text-secondary">
          검색 후보와 근접 참고 후보를 구분해 3D로 확인할 수 있습니다. 신규 후보는 검수용이며 자동
          적용·보정·내보내기를 지원하지 않습니다. 검색어는 결과가 있는 작업과 함께 작업 기록에
          보관됩니다.
        </p>
      </div>
    </AppShell>
  );
}
