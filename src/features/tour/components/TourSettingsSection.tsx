import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/Button";
import { useTourStore } from "@/shared/stores/tourStore";

/** 설정 > 앱 사용법. 투어를 처음부터 다시 본다. */
export function TourSettingsSection() {
  const navigate = useNavigate();
  const start = useTourStore((s) => s.start);
  const completedAt = useTourStore((s) => s.completedAt);

  return (
    <section>
      <h2 className="text-[15px] font-bold text-text-primary">앱 사용법</h2>
      <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-0 p-4">
        <div className="min-w-0">
          <p className="text-[14px] text-text-primary">튜토리얼 다시 보기</p>
          <p className="mt-1 text-[12px] text-text-secondary">
            {completedAt
              ? "장면 하나를 넣고 저장하기까지 화면을 따라가며 안내합니다."
              : "아직 끝까지 보지 않았습니다. 장면 하나를 넣고 저장하기까지 안내합니다."}
          </p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            // 투어는 홈에서 시작한다.
            start();
            navigate("/app/home");
          }}
        >
          튜토리얼 시작
        </Button>
      </div>
    </section>
  );
}
