import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { OAuthCallbackPage } from "@/features/auth/pages/OAuthCallbackPage";
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
import { RequireAuth, RedirectIfAuthed } from "./guards";

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
      {
        path: "/auth/login",
        element: (
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        ),
      },
      { path: "/auth/callback", element: <OAuthCallbackPage /> },
      {
        path: "/app/home",
        element: (
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        ),
      },
      {
        path: "/app/preview",
        element: (
          <RequireAuth>
            <InputPreviewPage />
          </RequireAuth>
        ),
      },
      {
        path: "/app/capture",
        element: (
          <RequireAuth>
            <CaptureOverlayPage />
          </RequireAuth>
        ),
      },
      {
        path: "/app/jobs/:jobId",
        element: (
          <RequireAuth>
            <PoseViewerPage />
          </RequireAuth>
        ),
      },
      {
        path: "/app/jobs/:jobId/save",
        element: (
          <RequireAuth>
            <SavePage />
          </RequireAuth>
        ),
      },
      {
        path: "/app/settings",
        element: (
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        ),
      },

      // 플로팅 바(ADR-008). 앱 창에 들어가지 않고 캡처 → 후보 → 저장까지 진행한다.
      {
        path: "/bar",
        element: (
          <RequireAuth>
            <BarCollapsedPage />
          </RequireAuth>
        ),
      },
      {
        path: "/bar/actions",
        element: (
          <RequireAuth>
            <BarActionsPage />
          </RequireAuth>
        ),
      },
      {
        path: "/bar/progress",
        element: (
          <RequireAuth>
            <BarProgressPage />
          </RequireAuth>
        ),
      },
      {
        path: "/bar/candidates",
        element: (
          <RequireAuth>
            <BarCandidatesPage />
          </RequireAuth>
        ),
      },
      {
        path: "/bar/save",
        element: (
          <RequireAuth>
            <BarSavePage />
          </RequireAuth>
        ),
      },

      { path: "*", element: <Navigate to="/app/home" replace /> },
    ],
  },
]);
