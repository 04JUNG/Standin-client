import { describe, expect, it } from "vitest";
import type { TourAnchorId, TourStepId } from "@/shared/types/tour";
import { TOUR_STEPS } from "./tourSteps";
import {
  previousAcknowledgedStep,
  resolveActiveStep,
  stepProgress,
  type TourContext,
} from "./resolveActiveStep";

function ctx(
  pathname: string,
  options: Partial<{ hasDraft: boolean; anchors: TourAnchorId[] }> = {},
): TourContext {
  const anchors = new Set(options.anchors ?? []);
  return {
    pathname,
    hasDraft: options.hasDraft ?? false,
    hasAnchor: (id) => anchors.has(id),
    // 테스트에서는 앵커가 있으면 누를 수 있는 것으로 본다. 비활성 상태는 개별 테스트에서 뺀다.
    isAnchorEnabled: (id) => anchors.has(id),
  };
}

const active = (c: TourContext, acknowledged: TourStepId[] = []) =>
  resolveActiveStep(TOUR_STEPS, c, acknowledged)?.id ?? null;

describe("resolveActiveStep", () => {
  it("홈에서 환영 스텝부터 시작한다", () => {
    expect(active(ctx("/app/home"))).toBe("welcome");
  });

  it("'다음'으로 넘긴 설명 스텝은 다시 뜨지 않는다", () => {
    expect(active(ctx("/app/home"), ["welcome", "sidebar", "upload"])).toBe("capture");
  });

  it("설명을 모두 넘기면 직접 입력을 넣는 스텝이 남는다", () => {
    const acknowledged: TourStepId[] = ["welcome", "sidebar", "upload", "capture"];
    expect(active(ctx("/app/home"), acknowledged)).toBe("input");
  });

  it("입력이 준비되어 미리보기로 넘어가면 입력 스텝은 저절로 끝난다", () => {
    const acknowledged: TourStepId[] = ["welcome", "sidebar", "upload", "capture"];
    expect(
      active(ctx("/app/preview", { hasDraft: true, anchors: ["preview.analyze"] }), acknowledged),
    ).toBe("analyze");
  });

  const seenHome: TourStepId[] = ["welcome", "sidebar", "upload", "capture"];

  it("입력을 남긴 채 사이드바로 홈에 돌아와도 안내가 사라지지 않는다", () => {
    // 홈에는 남은 입력으로 돌아갈 길이 없다. '이미 넣었다'로 보면 투어가 조용히 사라진다.
    expect(active(ctx("/app/home", { hasDraft: true }), seenHome)).toBe("input");
  });

  it("캡처를 취소하고 홈으로 돌아오면 입력 스텝이 다시 활성이 된다", () => {
    // 오버레이에서 Esc → 초안 없이 홈 복귀.
    expect(active(ctx("/app/home", { hasDraft: false }), seenHome)).toBe("input");
  });

  it("미리보기에서 '다시 선택'을 눌러 초안이 사라지면 입력 스텝으로 되감긴다", () => {
    expect(
      active(ctx("/app/preview", { hasDraft: true, anchors: ["preview.analyze"] }), seenHome),
    ).toBe("analyze");
    expect(active(ctx("/app/home", { hasDraft: false }), seenHome)).toBe("input");
  });

  it("분석 중에는 대기 스텝, 후보가 오면 선택 스텝으로 넘어간다", () => {
    const job = "/app/jobs/abc";
    expect(active(ctx(job, { hasDraft: true, anchors: ["jobs.pending"] }), seenHome)).toBe(
      "waiting",
    );
    expect(active(ctx(job, { hasDraft: true, anchors: ["jobs.candidates"] }), seenHome)).toBe(
      "choose",
    );
  });

  it("후보를 모두 고르면 확정 스텝으로 넘어간다", () => {
    const c = ctx("/app/jobs/abc", {
      hasDraft: true,
      anchors: ["jobs.candidates", "jobs.confirm"],
    });
    expect(active(c, seenHome)).toBe("confirm");
  });

  it("분석이 실패하면 종료 스텝이 뜬다", () => {
    const c = ctx("/app/jobs/abc", { hasDraft: true, anchors: ["jobs.error"] });
    expect(active(c, seenHome)).toBe("failed");
    expect(TOUR_STEPS.find((s) => s.id === "failed")?.terminal).toBe(true);
  });

  it("저장이 실패하면 종료 스텝이 뜬다", () => {
    // 저장 실패는 투어가 조용히 사라지는 막다른 길이 되기 쉽다.
    const c = ctx("/app/jobs/abc/save", { hasDraft: true, anchors: ["save.error"] });
    expect(active(c, seenHome)).toBe("savefailed");
  });

  it("다시 저장에 성공하면 저장 완료 스텝으로 이어진다", () => {
    const c = ctx("/app/jobs/abc/save", {
      hasDraft: true,
      anchors: ["save.files", "save.newScene"],
    });
    expect(active(c, seenHome)).toBe("saved");
  });

  it("확인 화면과 저장 화면의 스텝을 순서대로 준다", () => {
    expect(
      active(
        ctx("/app/jobs/abc/review", { hasDraft: true, anchors: ["review.confirm"] }),
        seenHome,
      ),
    ).toBe("review");
    expect(
      active(
        ctx("/app/jobs/abc/save", { hasDraft: true, anchors: ["save.files", "save.newScene"] }),
        seenHome,
      ),
    ).toBe("saved");
    expect(
      active(
        ctx("/app/jobs/abc/save", { hasDraft: true, anchors: ["save.files", "save.newScene"] }),
        [...seenHome, "saved"],
      ),
    ).toBe("finish");
  });

  it("투어와 무관한 화면에서는 아무 스텝도 주지 않는다", () => {
    expect(active(ctx("/app/settings"), seenHome)).toBeNull();
  });

  it("바 모드 경로에도 스텝이 없다", () => {
    expect(active(ctx("/bar/actions", { hasDraft: true }), seenHome)).toBeNull();
  });
});

describe("stepProgress", () => {
  it("실패 안내 스텝은 진행 표시에서 세지 않는다", () => {
    const total = TOUR_STEPS.filter((s) => !s.terminal).length;
    expect(stepProgress(TOUR_STEPS, TOUR_STEPS[0]).total).toBe(total);
    expect(stepProgress(TOUR_STEPS, TOUR_STEPS[0]).current).toBe(1);
  });
});

describe("previousAcknowledgedStep", () => {
  it("설명 스텝 사이에서는 이전으로 돌아갈 수 있다", () => {
    const step = TOUR_STEPS.find((s) => s.id === "capture")!;
    expect(previousAcknowledgedStep(TOUR_STEPS, step, ["welcome", "sidebar", "upload"])?.id).toBe(
      "upload",
    );
  });

  it("이미 한 동작은 되돌리지 않는다", () => {
    const step = TOUR_STEPS.find((s) => s.id === "analyze")!;
    expect(
      previousAcknowledgedStep(TOUR_STEPS, step, ["welcome", "sidebar", "upload", "capture"]),
    ).toBeNull();
  });
});
