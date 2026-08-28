import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { findTourAnchor } from "@/shared/lib/tourAnchor";
import { hasSeenTour, useTourStore } from "@/shared/stores/tourStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { TOUR_STEPS } from "../lib/tourSteps";
import {
  previousAcknowledgedStep,
  resolveActiveStep,
  stepProgress,
} from "../lib/resolveActiveStep";
import { useAnchorSnapshot, type AnchorSnapshot } from "../hooks/useAnchorSnapshot";
import { useTourContext } from "../hooks/useTourContext";
import { TourSpotlight, type SpotlightRect } from "./TourSpotlight";
import { TourTooltip } from "./TourTooltip";
import type { TourStep } from "../lib/resolveActiveStep";

/** 여러 앵커를 하나로 묶어 강조한다. 하나도 못 찾으면 화면 가운데 카드로 떨어진다. */
function unionRect(step: TourStep, snapshot: AnchorSnapshot): SpotlightRect | null {
  const rects = step.anchors.map((id) => snapshot.get(id)?.rect).filter((r) => r !== undefined);
  if (rects.length === 0) return null;

  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const pad = 8;
  return {
    top: top - pad,
    left: left - pad,
    width: right - left + pad * 2,
    height: bottom - top + pad * 2,
  };
}

/**
 * 투어의 유일한 마운트 지점(RootLayout의 앱 모드 분기).
 *
 * AppShell이 아니라 여기인 이유: AppShell은 화면마다 마운트·언마운트되므로 화면을 옮길
 * 때마다 오버레이가 깜빡인다. RootLayout은 앱 전체에 한 번만 걸리고, app/이라 features를
 * 자유롭게 읽을 수 있다(WindowModeSync·UpdateBanner가 여기 있는 것과 같은 이유).
 *
 * 캡처 오버레이와 바 모드에서는 RootLayout이 이 분기를 그리지 않아 투어가 저절로 사라지고,
 * 앱 모드로 돌아오면 화면에 맞는 스텝이 다시 활성이 된다.
 */
export function TourLayer() {
  const { pathname } = useLocation();
  const active = useTourStore((s) => s.active);
  const acknowledged = useTourStore((s) => s.acknowledged);
  const completedAt = useTourStore((s) => s.completedAt);
  const dismissedAt = useTourStore((s) => s.dismissedAt);
  const start = useTourStore((s) => s.start);
  const acknowledge = useTourStore((s) => s.acknowledge);
  const unacknowledge = useTourStore((s) => s.unacknowledge);
  const finish = useTourStore((s) => s.finish);
  const dismiss = useTourStore((s) => s.dismiss);
  const installationStatus = useInstallationStore((s) => s.status);

  const snapshot = useAnchorSnapshot(active);
  const ctx = useTourContext(snapshot);
  const step = active ? resolveActiveStep(TOUR_STEPS, ctx, acknowledged) : null;

  /**
   * 첫 실행 자동 시작.
   *
   * BetaConsentPage가 아니라 여기서 판단한다 — 동의 직후 목적지가 macOS 권한 화면과 홈으로
   * 갈리기 때문이다(BetaConsentPage.submit). 홈 도착을 조건으로 두면 두 경로가 하나가 된다.
   */
  useEffect(() => {
    if (active || pathname !== "/app/home") return;
    if (installationStatus !== "registered") return;
    if (hasSeenTour({ completedAt, dismissedAt })) return;
    start();
  }, [active, pathname, installationStatus, completedAt, dismissedAt, start]);

  // 강조할 요소가 화면 밖에 있으면 보이지 않는 곳을 가리키게 된다.
  const stepId = step?.id;
  const firstAnchor = step?.anchors[0];
  useEffect(() => {
    if (!stepId || !firstAnchor) return;
    findTourAnchor(firstAnchor)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [stepId, firstAnchor]);

  if (!active || !step) return null;

  const rect = unionRect(step, snapshot);
  const previous = previousAcknowledgedStep(TOUR_STEPS, step, acknowledged);
  const isLast = step.id === TOUR_STEPS[TOUR_STEPS.length - 1].id;

  return createPortal(
    <>
      <TourSpotlight rect={rect} />
      <TourTooltip
        step={step}
        rect={rect}
        progress={stepProgress(TOUR_STEPS, step)}
        isLast={isLast}
        canGoBack={previous !== null}
        onBack={() => previous && unacknowledge(previous.id)}
        onNext={() => acknowledge(step.id)}
        onFinish={finish}
        onDismiss={dismiss}
      />
    </>,
    document.body,
  );
}
