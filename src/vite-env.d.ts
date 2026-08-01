/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SKIP_AUTH?: string;
  readonly VITE_WEB_BASE_URL?: string;
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_USE_MOCK_POSE_API?: string;
  readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
