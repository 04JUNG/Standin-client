import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config";
import path from "node:path";
export default mergeConfig(
  base,
  defineConfig({
    cacheDir: path.resolve(__dirname, "../../work/preview-vite"),
    build: {
      outDir: "../outputs/preview",
      rollupOptions: { input: path.resolve(__dirname, "csp-layout.html") },
    },
  }),
);
