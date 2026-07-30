/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri는 고정 포트를 기대한다. src-tauri는 watch에서 제외한다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // 컴포넌트 테스트가 있어 기본 환경을 jsdom으로 둔다. 순수 함수 테스트도 그대로 돈다.
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // src-tauri 안의 Rust 테스트는 cargo가 돌린다.
    exclude: ["node_modules/**", "src-tauri/**", "dist/**"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
