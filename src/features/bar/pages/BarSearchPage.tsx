import { useLocation } from "react-router-dom";
import { BarShell } from "../components/BarShell";
import { SemanticSearchBar } from "@/features/semantic-search/SemanticSearchBar";
import { initialSearchQuery } from "@/features/semantic-search/searchDraft";

export function BarSearchPage() {
  const { state } = useLocation();
  return (
    <BarShell title="문장으로 포즈 찾기">
      <div className="min-w-0 space-y-3 p-3">
        <SemanticSearchBar
          initialQuery={initialSearchQuery(state)}
          surface="bar"
          hasResults={false}
        />
        <p className="text-xs text-text-secondary">
          동작과 팔·다리 방향을 적어주세요. 검색 결과도 이 창에서 확인할 수 있어요.
        </p>
      </div>
    </BarShell>
  );
}
