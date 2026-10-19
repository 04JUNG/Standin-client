import { useId, useLayoutEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { messageOf } from "@/shared/api/errors";
import { useSemanticSearch } from "./useSemanticSearch";

/** Search in place without sending the floating bar back to the main app. */
export function SemanticSearchBar({
  initialQuery,
  surface = "app",
  resultKey,
}: {
  initialQuery: string;
  surface?: "app" | "bar";
  resultKey?: string;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // A new result starts at its first row without replacing the focused input.
    let ancestor = root.current?.parentElement;
    while (ancestor) {
      if (
        /auto|scroll/.test(getComputedStyle(ancestor).overflowY) &&
        ancestor.scrollHeight > ancestor.clientHeight
      ) {
        ancestor.scrollTop = 0;
        break;
      }
      ancestor = ancestor.parentElement;
    }
  }, [resultKey]);
  const { query, edit, submit, pending, noResult, availability, search, setComposing, ready } =
    useSemanticSearch(initialQuery, surface, resultKey);
  const unavailable =
    availability.isError ||
    availability.data?.available === false ||
    (availability.data && !availability.data.supportsAllResults);
  return (
    <section ref={root} aria-label="포즈 검색" className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        어떤 포즈를 찾으세요?
      </label>
      <form
        role="search"
        aria-label="포즈 다시 찾기"
        aria-busy={pending}
        className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface-0 p-1.5 focus-within:border-brand-sky focus-within:ring-2 focus-within:ring-brand-sky/30"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Search className="ml-2 h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
        <input
          id={id}
          type="search"
          value={query}
          maxLength={500}
          enterKeyHint="search"
          aria-describedby={`${id}-hint`}
          placeholder="예: 두 팔을 머리 위로 올린 자세"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-text-primary outline-none"
          onChange={(event) => edit(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            submit();
          }}
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="shrink-0 focus-visible:ring-2 focus-visible:ring-brand-sky"
          disabled={!query.trim() || pending || !ready}
          loading={pending}
        >
          {pending ? "찾는 중…" : "다시 검색"}
        </Button>
      </form>
      <p id={`${id}-hint`} className="text-xs text-text-secondary">
        검색어를 바꾸면 자동으로 검색해요. Enter를 눌러 바로 검색할 수도 있어요.
      </p>
      {pending ? (
        <p role="status" className="text-xs text-text-secondary">
          새 포즈를 찾고 있어요. 아래는 이전 검색 결과예요.
        </p>
      ) : noResult ? (
        <p role="status" className="text-xs text-text-secondary">
          새 검색어에 맞는 포즈가 없어요. 아래는 이전 검색 결과예요. 다른 동작으로 다시 찾아보세요.
        </p>
      ) : query !== initialQuery ? (
        <p className="text-xs text-text-secondary">아래는 이전 검색 결과예요.</p>
      ) : null}
      {availability.isPending && (
        <p role="status" className="text-xs text-text-secondary">
          검색을 준비하고 있어요…
        </p>
      )}
      {unavailable && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <p>지금은 문장 검색을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.</p>
          <Button variant="secondary" size="sm" onClick={() => void availability.refetch()}>
            다시 확인
          </Button>
        </div>
      )}
      {search.isError && (
        <p role="alert" className="text-xs text-brand-coral">
          {messageOf(search.error, "검색하지 못했어요. 잠시 후 다시 시도해 주세요.")}
        </p>
      )}
    </section>
  );
}
