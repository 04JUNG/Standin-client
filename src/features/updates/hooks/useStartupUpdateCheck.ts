import { useEffect } from "react";
import { useUpdateStore } from "../store/updateStore";

/** 앱 실행 중 한 번만 확인한다. 라우팅으로 재마운트돼도 다시 나가지 않는다. */
let started = false;

/**
 * 시작 시 업데이트를 조용히 확인한다(ADR-011).
 *
 * 실패해도 아무것도 띄우지 않는다. 사용자가 요청하지 않은 확인이라 실패를 알릴
 * 이유가 없고, 설정 화면에서 직접 확인하면 그때는 오류를 보여준다.
 */
export function useStartupUpdateCheck() {
  const check = useUpdateStore((s) => s.check);

  useEffect(() => {
    if (started) return;
    started = true;
    void check("startup");
  }, [check]);
}

/** 테스트에서 1회 실행 가드를 되돌린다. */
export function resetStartupUpdateCheck() {
  started = false;
}
