import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFile } from "node:fs/promises";
const records = process.env.SKIN_QA_RECORDS,
  assets = process.env.SKIN_QA_ASSET_ROOT;
const variants: Record<string, string> = {
  "flesh-guide": "final-2",
  "gray-guide": "extra-gray-guide-2",
  flesh: "extra-flesh-2",
  muscle: "extra-muscle-2",
};
export default defineConfig({
  root: path.resolve(__dirname, "../.."),
  plugins: [
    {
      name: "skin-recorded-evidence-only",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            if (!records || !assets) return next();
            const url = req.url?.split("?")[0] ?? "";
            if (req.headers.accept?.includes("text/html") && /^\/(app|bar)(\/|$)/.test(url)) {
              req.url = "/tools/skin-native-qa/index.html";
              return next();
            }
            const request = url.match(/^\/qa\/([^/]+)\/(operation|packet|file)$/);
            if (request && variants[request[1]]) {
              const suffix = request[2] === "file" ? "fbx" : request[2] + ".json";
              const bytes = await readFile(path.join(records, variants[request[1]] + "." + suffix));
              res.setHeader(
                "Content-Type",
                request[2] === "file" ? "application/octet-stream" : "application/json",
              );
              res.setHeader("Cache-Control", "no-store");
              return res.end(bytes);
            }
            if (url.includes("/skin-assets/")) {
              const manifest = JSON.parse(
                await readFile(path.join(assets, "manifest.json"), "utf8"),
              );
              for (const prefix of Object.values(variants)) {
                let op;
                try {
                  op = JSON.parse(
                    await readFile(path.join(records, prefix + ".operation.json"), "utf8"),
                  );
                } catch {
                  continue;
                }
                for (const kind of ["uv", "texture"]) {
                  const a = op.skinPreview?.[kind];
                  if (a?.url !== url) continue;
                  const model = manifest.models[op.skinPreview.compatibility.characterId];
                  const row = kind === "uv" ? model.uv : model.preview_textures[op.skin.id];
                  if (row.sha256 !== a.sha256) throw Error("recorded manifest changed");
                  const bytes = await readFile(path.join(assets, row.path));
                  res.setHeader("Content-Type", kind === "uv" ? "application/gzip" : "image/png");
                  res.setHeader("Content-Length", bytes.length);
                  res.setHeader("X-Skin-Asset-SHA256", a.sha256);
                  res.setHeader("X-Standin-State-Hash", op.stateHash);
                  res.setHeader("X-Standin-Revision", op.revision);
                  res.setHeader("Cache-Control", "no-store");
                  return res.end(bytes);
                }
              }
              res.statusCode = 404;
              return res.end("unrecorded asset");
            }
            next();
          } catch {
            res.statusCode = 404;
            res.end("recorded QA input unavailable");
          }
        });
      },
    },
    react(),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  publicDir: false,
  server: { host: "127.0.0.1", port: 1451, strictPort: true },
});
