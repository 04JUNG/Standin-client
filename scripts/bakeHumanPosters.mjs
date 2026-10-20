#!/usr/bin/env node
/* eslint-env node */
/** Local-only offline asset writer. Never connects to a Converter or deployment. */
import { createServer } from "vite";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((v, i, a) => (v.startsWith("--") ? [v.slice(2), a[i + 1]] : null))
    .filter(Boolean),
);
for (const required of [
  "library",
  "inventory",
  "identities",
  "templates",
  "out",
  "renderer-config",
])
  if (!args[required]) throw Error("missing --" + required);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const library = path.resolve(args.library),
  out = path.resolve(args.out),
  templates = path.resolve(args.templates);
const identities = JSON.parse(await readFile(args.identities, "utf8"));
const scopes = ["full", "half", "bust", "shoulder_head", "head"];
const revision = JSON.parse(await readFile(args["renderer-config"], "utf8"));
for (const [name, sha] of Object.entries(revision.client_source_sha256)) {
  const source = await readFile(path.join(process.cwd(), "src/features/pose-viewer", name), "utf8");
  if (hash(source.replace(/\r\n/g, "\n")) !== sha) throw Error("renderer source changed: " + name);
}
const rows = JSON.parse(await readFile(args.inventory, "utf8"));
const sources = new Map();
for (const row of rows) {
  if (!/^[a-f0-9]{64}$/.test(row.source_bvh_sha256)) throw Error("invalid source");
  const file = path.join(library, "bvh", path.basename(row.file));
  if (hash(await readFile(file)) !== row.source_bvh_sha256) throw Error("inventory source changed");
  sources.set(row.source_bvh_sha256, file);
}
for (const scope of scopes)
  if (
    hash(await readFile(path.join(templates, scope + ".json.gz"))) !==
    identities[scope].template_sha256
  )
    throw Error("template changed");
await mkdir(out, { recursive: true });
const nonce = randomUUID(),
  port = Number(args.port ?? 1441),
  origin = "http://127.0.0.1:" + port;
const expected = (source, scope) => ({ ...identities[scope], source_bvh_sha256: source });
const pngOk = (data) =>
  data.length >= 24 &&
  data.length <= 2_097_152 &&
  data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
  data.readUInt32BE(16) === 256 &&
  data.readUInt32BE(20) === 256;
async function valid(source, scope) {
  try {
    const stem = path.join(out, source + "__" + scope),
      meta = JSON.parse(await readFile(stem + ".json", "utf8")),
      data = await readFile(stem + ".png");
    return (
      Object.entries(expected(source, scope)).every(([k, v]) => meta[k] === v) &&
      meta.image_sha256 === hash(data) &&
      meta.bytes === data.length &&
      pngOk(data)
    );
  } catch {
    return false;
  }
}
const manifest = {
  version: "default-body-poster-library-v1",
  expected: rows.length * 5,
  total_expected: rows.length * 5,
  unique_sources: sources.size,
  render_method: revision.version,
  failures: 0,
  complete: false,
  db_sha256: hash(await readFile(path.join(library, "poses.db"))),
  scopes,
};
await writeFile(path.join(out, "library.json"), JSON.stringify(manifest, null, 2) + "\n");
let written = 0,
  started = Date.now();
async function progress() {
  await writeFile(
    path.join(out, "bake-progress.json"),
    JSON.stringify(
      {
        written,
        unique_images: sources.size * 5,
        seconds: (Date.now() - started) / 1000,
        complete: manifest.complete,
      },
      null,
      2,
    ) + "\n",
  );
}
const server = await createServer({
  server: { host: "127.0.0.1", port, strictPort: true },
  plugins: [
    {
      name: "local-human-poster-bake",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, origin);
          if (!url.pathname.startsWith("/__human-bake/")) return next();
          const json = (data, status = 200) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
          };
          try {
            const parts = url.pathname.slice("/__human-bake/".length).split("/");
            if (req.method === "GET" && parts[0] === "work") {
              const work = [];
              for (const source of sources.keys()) {
                const missing = [];
                for (const scope of scopes) if (!(await valid(source, scope))) missing.push(scope);
                if (missing.length) work.push({ source, scopes: missing });
              }
              return json({
                nonce,
                work,
                total_sources: sources.size,
                source_rows: rows.length,
                identities,
              });
            }
            if (req.method === "GET" && parts[0] === "source" && sources.has(parts[1])) {
              const data = await readFile(sources.get(parts[1]));
              if (hash(data) !== parts[1]) throw Error("source changed");
              res.setHeader("Content-Type", "text/plain");
              return res.end(data);
            }
            if (req.method === "GET" && parts[0] === "template" && scopes.includes(parts[1])) {
              const data = await readFile(path.join(templates, parts[1] + ".json.gz"));
              if (hash(data) !== identities[parts[1]].template_sha256)
                throw Error("template changed");
              res.setHeader("Content-Type", "application/octet-stream");
              return res.end(data);
            }
            if (
              req.method !== "POST" ||
              req.headers.origin !== origin ||
              req.headers["x-bake-nonce"] !== nonce
            )
              return json({ error: "forbidden" }, 403);
            if (parts[0] === "poster" && sources.has(parts[1]) && scopes.includes(parts[2])) {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 2_097_152) throw Error("PNG too large");
                chunks.push(chunk);
              }
              const data = Buffer.concat(chunks);
              if (!pngOk(data)) throw Error("invalid rendered PNG");
              const stem = path.join(out, parts[1] + "__" + parts[2]),
                metadata = {
                  ...expected(parts[1], parts[2]),
                  image_sha256: hash(data),
                  bytes: data.length,
                };
              for (const [extension, content] of [
                [".png", data],
                [".json", JSON.stringify(metadata)],
              ]) {
                const temporary = stem + "." + randomUUID() + ".tmp";
                await writeFile(temporary, content);
                await rename(temporary, stem + extension);
              }
              written++;
              if (written % 25 === 0) await progress();
              return json({ ok: true });
            }
            if (parts[0] === "finish") {
              let missing = 0;
              for (const [source, file] of sources) {
                if (hash(await readFile(file)) !== source) throw Error("final source changed");
                for (const scope of scopes) if (!(await valid(source, scope))) missing++;
              }
              manifest.failures = missing;
              manifest.complete = missing === 0;
              await writeFile(
                path.join(out, "library.json"),
                JSON.stringify(manifest, null, 2) + "\n",
              );
              await progress();
              return json(manifest);
            }
            return json({ error: "not_found" }, 404);
          } catch (error) {
            return json({ error: String(error) }, 400);
          }
        });
      },
    },
  ],
});
await server.listen();
console.log("Offline human poster bake UI: " + origin + "/tools/human-posters/");
