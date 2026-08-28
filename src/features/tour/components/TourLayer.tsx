import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { findTourAnchor } from "@/shared/lib/tourAnchor";
import type { TourAnchorId } from "@/shared/types/tour";
import { hasSeenTour, useTourStore } from "@/shared/stores/tourStore";
import { useInstallationStore } from "@/features/installation/installationStore";
import { TOUR_STEPS } from "../lib/tourSteps";
import {
  previousAcknowledgedStep,
  resolveActiveStep,
  stepProgress,
  type TourStep,
} from "../lib/resolveActiveStep";
import { useAnchorSnapshot, type AnchorSnapshot } from "../hooks/useAnchorSnapshot";
import { useTourContext } from "../hooks/useTourContext";
import { TourSpotlight, type SpotlightRect } from "./TourSpotlight";
import { TourTooltip } from "./TourTooltip";
import { TourResumePill } from "./TourResumePill";

const EMPTY_ANCHORS: readonly TourAnchorId[] = [];

/** 강조할 곳이 화면 밖으로 밀려 있으면 null. 그때는 가운데 카드로 그린다. */
function spotlightRect(step: TourStep, snapshot: AnchorSnapshot): SpotlightRect | null {
  const boxes = step.anchors.map((id) => snapshot.get(id)?.visible).filter((b) => b != null);
  if (boxes.length === 0) return null;

  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  const right = Math.max(...boxes.map((b) => b.left + b.width));

  // 여백 8px. 단, 잘라낸 경계 밖으로 다시 나가지 않도록 화면 안에 가둔다.
  const pad = 8;
  const t = Math.max(0, top - pad);
  const l = Math.max(0, left - pad);
  const b = Math.min(window.innerHeight, bottom + pad);
  const r = Math.min(window.innerWidth, right + pad);
  return { top: t, left: l, width: r - l, height: b - t };
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
  const navigate = useNavigate();
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

  // 위치를 잴 앵커는 활성 스텝의 것만이다. 활성 스텝은 직전 스냅샷에서 나오므로
  // 한 주기 늦게 반영된다 — 매 프레임 전부 재다가 렌더러가 포화되는 것을 막는다.
  const [measure, setMeasure] = useState<readonly TourAnchorId[]>(EMPTY_ANCHORS);
  const snapshot = useAnchorSnapshot(active, measure);
  const ctx = useTourContext(snapshot);
  const step = active ? resolveActiveStep(TOUR_STEPS, ctx, acknowledged) : null;

  const measureKey = step?.anchors.join(",") ?? "";
  useEffect(() => {
    setMeasure(measureKey ? (measureKey.split(",") as TourAnchorId[]) : EMPTY_ANCHORS);
  }, [measureKey]);

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

  /**
   * 투어는 켜져 있는데 이 화면에 해당하는 스텝이 없을 때(설정 화면 등) 알린다.
   * 화면 전환 중에 깜빡이지 않도록 잠시 기다렸다 띄운다.
   */
  const [strayed, setStrayed] = useState(false);
  const hasStep = step !== null;
  useEffect(() => {
    if (!active || hasStep) {
      setStrayed(false);
      return;
    }
    const timer = setTimeout(() => setStrayed(true), 1200);
    return () => clearTimeout(timer);
  }, [active, hasStep, pathname]);

  if (!active) return null;

  if (!step) {
    return strayed
      ? createPortal(
          <TourResumePill onResume={() => navigate("/app/home")} onDismiss={dismiss} />,
          document.body,
        )
      : null;
  }

  const rect = spotlightRect(step, snapshot);
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
