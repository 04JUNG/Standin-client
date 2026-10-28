import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Asset snapshots stay outside Git. No network or production API is used by this viewer.
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  publicDir: process.env.OUTLINE_PREVIEW_ASSETS || false,
  build: {
    outDir: process.env.OUTLINE_PREVIEW_OUTPUT || "../../dist/outline-preview",
    emptyOutDir: false,
  },
  server: { host: "127.0.0.1", port: 1432, strictPort: true },
});
