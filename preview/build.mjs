import { build } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] ?? path.join(repo, "../outputs/preview"));
await build({
  root: repo,
  configFile: path.join(repo, "preview/vite.config.ts"),
  base: "./",
  build: { outDir: output },
});
const entry = path.join(output, "preview/csp-layout.html");
let html = await readFile(entry, "utf8");
const script = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const style = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
if (!script || !style) throw Error("Missing preview bundle");
const code = await readFile(path.resolve(path.dirname(entry), script[1]), "utf8");
const css = await readFile(path.resolve(path.dirname(entry), style[1]), "utf8");
html = html.replace(
  script[0],
  () => `<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(style[0], () => `<style>${css}</style>`);
await writeFile(path.join(output, "index.html"), html);
console.log(`Standalone preview: ${path.join(output, "index.html")}`);
