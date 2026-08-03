import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useInstallationStore } from "@/features/installation/installationStore";

/**
 * 제품 라우트 가드. 클로즈베타는 로그인이 없고 데이터 수집 동의가 유일한 관문이다.
 *
 * 어디로 가려다 막혔는지 `state.from`으로 넘긴다.
 * initializing은 아직 판단할 수 없는 상태다 — 통과시키면 동의 전 화면이 잠깐 그려진다.
 * 보안 저장소를 읽는 동안이므로 흰 화면 대신 splash를 보여준다(docs/06 §7).
 */
export function RequireInstallation({ children }: { children: ReactNode }) {
  const status = useInstallationStore((state) => state.status);
  const location = useLocation();
  if (status === "initializing") {
    return (
      <div className="flex h-full items-center justify-center bg-brand-paper">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" aria-label="불러오는 중" />
      </div>
    );
  }
  if (status !== "registered") {
    return <Navigate to="/beta-consent" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
