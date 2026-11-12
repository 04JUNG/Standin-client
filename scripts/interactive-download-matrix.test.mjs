// @vitest-environment node
/** Opt-in: built BFF + local Converter/Blender + private approved fixture assets.
 * Required env: STANDIN_BFF_WORKTREE, CONVERTER_BASE_URL, STANDIN_QA_FIXTURE.
 * Fixture JSON: tokenFile, roughBvh, textBvh, characters, shapes, output.
 * Ownership, search results and object storage are fixtures; export bytes are real.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve as path } from "node:path";
import { expect, it, vi } from "vitest";
import { InteractiveController } from "../src/features/pose-viewer/interactive/controller";
import { interactiveHttp } from "../src/features/pose-viewer/interactive/http";
import { setInstallationCredentials } from "../src/shared/api/client";

const root = process.env.STANDIN_BFF_WORKTREE;
const fixture = process.env.STANDIN_QA_FIXTURE;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const fullMatrix = [
  ["default"], ["flesh"], ["muscle"], ["gray-guide"], ["flesh-guide"], ["flesh-muscle"],
  ["outline", 2], ["flesh-guide+outline", 2], ["flesh-muscle+outline", 2],
];

it.skipIf(!root || !fixture)("rough and text selections prepare and download verified appearance FBXs", async () => {
  const f = await readJson(fixture);
  const fromBff = (module) => require(path(root, module));
  const { Hono } = fromBff("node_modules/hono/dist/index.js");
  const { PGlite } = fromBff("node_modules/@electric-sql/pglite/dist/index.js");
  const { OperationStore } = fromBff("dist/interactive-state/store.js");
  const { INTERACTIVE_SCHEMA } = fromBff("dist/interactive-state/schema.js");
  const { InteractiveService } = fromBff("dist/interactive-state/service.js");
  const { createInteractiveRoutes } = fromBff("dist/interactive-state/routes.js");
  const { createSelectionResolver } = fromBff("dist/interactive-state/selection.js");
  const { attachSemanticPresentation } = fromBff("dist/semantic/presentation.js");
  const { createInteractiveWorker } = fromBff("dist/converter/interactive.js");
  const { getPreviewRuntime } = fromBff("dist/converter/previewRuntime.js");
  const { createSkinArtifacts } = fromBff("dist/converter/skin.js");
  const { createOutlineArtifacts } = fromBff("dist/converter/outline.js");
  const characterId = "male-base-v0-8-0";
  const character = (await readJson(f.characters)).characters[characterId];
  const recipe = f.shapes ? (await readJson(f.shapes)).characters[characterId] : null;
  const body = { characterId, assetSha256: character.sha256, rigVersion: "rig-fixture-v1" };
  const transport = {
    baseUrl: process.env.CONVERTER_BASE_URL,
    token: (await readFile(f.tokenFile, "utf8")).trim(),
    fetch: globalThis.fetch,
    timeoutMs: 300000,
  };
  const runtime = () => getPreviewRuntime(transport.fetch);
  const owner = "inst_download_qa", jobs = new Map(), sources = new Map();
  for (const [kind, bvh, poseId] of [["rough", f.roughBvh, "ob_083"], ["text", f.textBvh, "Asking Question_01"]]) {
    const jobId = "job_download_" + kind + "_" + process.pid;
    const bytes = await readFile(bvh);
    const camera = {
      version: "candidate-camera-v2", reference: "search-fit", source_bvh_sha256: sha(bytes),
      projection: "orthographic", rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], distance_torso: null,
    };
    const candidate = kind === "text"
      ? { id: "text", poseId, rank: 1, source: "semantic", sourceBvhSha256: sha(bytes),
          lookupAllowed: true, bvhAvailable: true, manualExportAllowed: true,
          reviewRequired: true, refineAllowed: false, releaseAllowed: false }
      : { id: "rough", poseId, rank: 1, sourceBvhSha256: sha(bytes), camera, releaseAllowed: true };
    const result = { jobId, source: kind === "text" ? "semantic" : "capture",
      candidatesByPerson: [{ personIndex: 0, outputScope: { selection: "full" }, candidates: [candidate] }] };
    if (kind === "text") attachSemanticPresentation(result);
    jobs.set(jobId, { kind, status: "completed", result });
    sources.set(poseId, bytes);
  }

  const db = new PGlite();
  await db.exec(`CREATE TABLE installations(id TEXT PRIMARY KEY); CREATE TABLE jobs(id TEXT PRIMARY KEY,installation_id TEXT,status TEXT);
    INSERT INTO installations VALUES('${owner}');
    INSERT INTO jobs VALUES ${[...jobs.keys()].map(id => `('${id}','${owner}','completed')`).join(",")};
    ${INTERACTIVE_SCHEMA}`);
  const store = new OperationStore((fn) => db.transaction((tx) => fn({
    query: (sql, args) => sql.includes("pg_advisory_xact_lock") ? Promise.resolve({ rows: [] }) : tx.query(sql, args),
  })));
  const stored = () => {
    const files = new Map(), key = (op, binding) => [op.jobId, binding].join(":");
    return {
      load: async (op, binding) => files.get(key(op, binding)) ?? null,
      publish: async (op, binding, artifact) => {
        files.set(key(op, binding), artifact);
        return artifact;
      },
    };
  };
  const service = new InteractiveService({
    store,
    resolve: createSelectionResolver({
      getOwnedJob: async (id, installation) => installation === owner ? jobs.get(id) : undefined,
      validateExportCandidate: async () => true,
      validateConfirmedSelection: async () => true,
      getPoseBvh: async (poseId) => new Response(sources.get(poseId)),
      selection: async () => ({ resolutionStatus: "ready", selectionRevision: 1, resolvedBody: body, shape: null, shapeSource: null }),
      checkCharacter: async () => "ok",
      handBakeFor: async () => null,
      resolveExportArtifact: async () => ({ variant: "base", fallbackReason: null }),
      findRefinedArtifact: async () => null,
      loadBodyCatalog: () => ({ assets: [{ ...body, shapeRuntime: recipe ? { rules: recipe.rules } : undefined }] }),
      runtime,
      modelPreviewIdentity: async () => ({ modelRevision: (await runtime()).modelRevision, characterSha256: character.sha256 }),
    }),
    worker: createInteractiveWorker(transport),
    skin: createSkinArtifacts({ ...transport, enabled: () => true, storage: stored() }),
    outline: createOutlineArtifacts({ ...transport, enabled: () => true, stature: () => 1.78, storage: stored() }),
    posters: { publish: async () => ({}), read: async () => undefined },
    renderPoster: async () => { throw Error("poster not exercised"); },
    metric: (event, stage, elapsedMs, code) => process.stdout.write(JSON.stringify({ event, stage, elapsedMs, code }) + "\n"),
  });
  for (const [target, method] of [[service, "revalidate"], [store, "update"]]) {
    const original = target[method].bind(target);
    target[method] = async (...args) => {
      try { return await original(...args); }
      catch (error) { process.stderr.write(`FBX_MATRIX ${method}: ${error?.stack ?? error}\n`); throw error; }
    };
  }
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("installationId", c.req.header("X-Installation-Id")); await next(); });
  app.route("/v1/analysis/jobs", createInteractiveRoutes(service, () => true));
  let injected = 0;
  const calls = new Map();
  vi.stubGlobal("fetch", async (input, init) => {
    const request = new Request(input, init);
    const pathname = new URL(request.url).pathname;
    const requestKey = request.method + " " + pathname;
    calls.set(requestKey, (calls.get(requestKey) ?? 0) + 1);
    if (f.inject503 && request.method === "GET" && /\/job_download_rough_.*\/interactive-state\/op_[^/]+$/.test(pathname) && injected < 2) {
      injected++;
      return Response.json({ error: { code: "INTERACTIVE_UNAVAILABLE", message: "fixture transient error" } }, { status: 503 });
    }
    return app.fetch(request);
  });
  setInstallationCredentials({ installationId: owner, deviceToken: "fixture" });
  await mkdir(f.output, { recursive: true });
  const rows = [];
  let stop = false;
  const loops = ["preview", "export"].map(async (stage) => {
    while (!stop) { await service.tick(stage); await sleep(125); }
  });
  try {
    for (const [jobId, job] of jobs) {
      const candidate = job.result.candidatesByPerson[0].candidates[0];
      const target = { jobId, personIndex: 0 };
      const controller = new InteractiveController(target, { ...interactiveHttp, variants: undefined });
      try {
        for (const [index, [name, width]] of (f.cases ?? fullMatrix).entries()) {
          const id = name.split("+")[0];
          const skin = ["default", "outline"].includes(id) ? undefined : { version: "fbx-skin-v1", id };
          const appearance = width ? { version: "fbx-outline-v1", width } : undefined;
          const binding = job.kind + "/" + name, started = performance.now();
          let previewMs, acceptedMs;
          const unsubscribe = controller.subscribe(() => {
            const snapshot = controller.snapshot();
            if (snapshot.operation && acceptedMs === undefined) acceptedMs = performance.now() - started;
            if (snapshot.previewState === "authoritative" && previewMs === undefined) previewMs = performance.now() - started;
          });
          try {
            controller.select(binding, candidate.id, true, appearance, skin, candidate.id, candidate.id);
            while (!controller.ready(binding)) {
              const s = controller.snapshot();
              if (s.error || s.exportState === "failed" || performance.now() - started > 270000)
                throw Error(`${binding}: ${s.previewState}/${s.exportState} (${s.failure?.code ?? s.failure?.message ?? "timeout"})`);
              await sleep(100);
            }
            const prepareMs = performance.now() - started;
            const op = controller.snapshot().operation;
            const fileStart = performance.now();
            const file = await controller.download(binding, AbortSignal.timeout(30000));
            const downloadMs = performance.now() - fileStart;
            expect(sha(file.bytes)).toBe(file.receipt.artifactSha256);
            expect(Buffer.from(file.bytes).subarray(0, 18).toString()).toBe("Kaydara FBX Binary");
            expect(op.exportReceipt.skin?.id).toBe(skin?.id);
            expect(op.exportReceipt.appearance?.width).toBe(appearance?.width);
            expect(op.exportReceipt.skinProof?.proof?.material?.embedded ?? !skin).toBe(true);
            if (width && skin) expect(op.exportReceipt.outline.sourceArtifactSha256).toBe(op.exportReceipt.skinProof.artifactSha256);
            const base = "/v1/analysis/jobs/" + jobId + "/people/0/interactive-state";
            expect(calls.get("POST " + base)).toBe(index + 1);
            expect(calls.get("POST " + base + "/" + op.operationId + "/export")).toBe(1);
            const row = { search: job.kind, name, cache: index === 0 ? "cold" : "warm",
              acceptedMs: Math.round(acceptedMs), previewMs: Math.round(previewMs),
              prepareMs: Math.round(prepareMs), downloadMs: Math.round(downloadMs),
              bytes: file.bytes.length, sha256: sha(file.bytes) };
            rows.push(row);
            await writeFile(path(f.output, job.kind + "-" + name + ".fbx"), file.bytes);
            await writeFile(path(f.output, "timings.json"), JSON.stringify(rows, null, 2));
            process.stdout.write("FBX_MATRIX " + JSON.stringify(row) + "\n");
          } finally { unsubscribe(); }
        }
      } finally { controller.dispose(); }
    }
    if (f.inject503) expect(injected).toBe(2);
  } finally {
    stop = true;
    setInstallationCredentials(null);
    vi.unstubAllGlobals();
    await Promise.all(loops);
    await db.close();
  }
}, 1200000);
