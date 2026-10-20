import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const repo = path.resolve(__dirname, "../..");
const { version } = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: { alias: { "@": path.join(repo, "src") } },
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) },
  build: { target: "es2022", outDir: path.join(repo, "e2e-dist"), emptyOutDir: true },
});
