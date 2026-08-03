/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WEB_BASE_URL?: string;
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_USE_MOCK_POSE_API?: string;
  readonly VITE_APP_ENV?: string;
  /** vite.config.ts가 package.json의 version을 주입한다. .env로 설정하지 않는다. */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
