import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { HomePage } from "@/features/home/pages/HomePage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { RequireAuth, RedirectIfAuthed } from "./guards";

/** 기본 라우트(CLAUDE.md §7). 인증 화면과 앱 화면을 분리한다. */
export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/home" replace /> },
  {
    path: "/auth/login",
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: "/app/home",
    element: (
      <RequireAuth>
        <HomePage />
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
  { path: "*", element: <Navigate to="/app/home" replace /> },
]);
