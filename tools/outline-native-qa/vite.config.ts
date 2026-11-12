import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  root: path.resolve(__dirname, "../.."),
  plugins: [
    {
      name: "qa-route-fallback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.headers.accept?.includes("text/html") && /^\/(app|bar)(\/|$)/.test(req.url ?? ""))
            req.url = "/tools/outline-native-qa/index.html";
          next();
        });
      },
    },
    react(),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  publicDir: process.env.OUTLINE_NATIVE_ASSETS || false,
  server: { host: "127.0.0.1", port: 1448, strictPort: true },
});
