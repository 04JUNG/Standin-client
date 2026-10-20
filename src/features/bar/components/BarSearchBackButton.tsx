import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/Button";

/** Only text-search screens add a back action; rough/capture screens keep their existing actions. */
export function BarSearchBackButton({ query }: { query?: string }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0"
      onClick={() =>
        navigate(query === undefined ? "/bar/actions" : "/bar/search", {
          replace: true,
          state: query === undefined ? undefined : { query },
        })
      }
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      뒤로가기
    </Button>
  );
}
