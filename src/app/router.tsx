import { createBrowserRouter, Navigate } from "react-router-dom";
import { HomePage } from "@/features/home/pages/HomePage";
import { InputPreviewPage } from "@/features/upload/pages/InputPreviewPage";
import { CaptureOverlayPage } from "@/features/capture/pages/CaptureOverlayPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { PoseViewerPage } from "@/features/pose-viewer/pages/PoseViewerPage";
import { SavePage } from "@/features/export/pages/SavePage";
import { BarCollapsedPage } from "@/features/bar/pages/BarCollapsedPage";
import { BarActionsPage } from "@/features/bar/pages/BarActionsPage";
import { BarProgressPage } from "@/features/bar/pages/BarProgressPage";
import { BarCandidatesPage } from "@/features/bar/pages/BarCandidatesPage";
import { BarSavePage } from "@/features/bar/pages/BarSavePage";
import { RootLayout } from "./RootLayout";
import { RequireInstallation } from "./guards";
import { BetaConsentPage } from "@/features/installation/BetaConsentPage";

/**
 * 기본 라우트(CLAUDE.md §7). 인증 화면과 앱 화면을 분리한다.
 *
 * `/bar/*`는 플로팅 바 모드다(ADR-008). 창 크기·장식·항상 위 설정은 WindowModeSync가
 * 라우트에서 파생해 네이티브에 반영하므로 페이지가 창을 직접 만지지 않는다.
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Navigate to="/app/home" replace /> },
      { path: "/auth/login", element: <Navigate to="/app/home" replace /> },
      { path: "/auth/callback", element: <Navigate to="/app/home" replace /> },
      { path: "/beta-consent", element: <BetaConsentPage /> },
      {
        path: "/app/home",
        element: (
          <RequireInstallation>
            <HomePage />
          </RequireInstallation>
        ),
      },
      {
        path: "/app/preview",
        element: (
          <RequireInstallation>
            <InputPreviewPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/app/capture",
        element: (
          <RequireInstallation>
            <CaptureOverlayPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/app/jobs/:jobId",
        element: (
          <RequireInstallation>
            <PoseViewerPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/app/jobs/:jobId/save",
        element: (
          <RequireInstallation>
            <SavePage />
          </RequireInstallation>
        ),
      },
      {
        path: "/app/settings",
        element: (
          <RequireInstallation>
            <SettingsPage />
          </RequireInstallation>
        ),
      },

      // 플로팅 바(ADR-008). 앱 창에 들어가지 않고 캡처 → 후보 → 저장까지 진행한다.
      {
        path: "/bar",
        element: (
          <RequireInstallation>
            <BarCollapsedPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/bar/actions",
        element: (
          <RequireInstallation>
            <BarActionsPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/bar/progress",
        element: (
          <RequireInstallation>
            <BarProgressPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/bar/candidates",
        element: (
          <RequireInstallation>
            <BarCandidatesPage />
          </RequireInstallation>
        ),
      },
      {
        path: "/bar/save",
        element: (
          <RequireInstallation>
            <BarSavePage />
          </RequireInstallation>
        ),
      },

      { path: "*", element: <Navigate to="/app/home" replace /> },
    ],
  },
]);
