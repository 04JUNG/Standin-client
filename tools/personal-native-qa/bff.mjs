/** Offline QA: real BFF Hono export, installation auth, SQL and refined-object
 * persistence. Recorded upstream BVH + loopback S3 protocol store are explicit
 * substitutes for inference/AWS. No production endpoint or personal model HTTP.
 * Build a separate BFF checkout first; pass BFF_QA_ROOT, QA_BVH and QA_WORK.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.env.BFF_QA_ROOT,
  work = process.env.QA_WORK;
if (!root || !work || !path.isAbsolute(root) || !path.isAbsolute(work))
  throw Error("Explicit isolated paths required");
await mkdir(work, { recursive: true });
const require = createRequire(path.join(root, "package.json"));
const moduleOf = async (name) => import(pathToFileURL(require.resolve(name)).href);
const source = new Uint8Array(await readFile(process.env.QA_BVH));
if (createHash("sha256").update(source).digest("hex") !== process.env.QA_BVH_SHA256)
  throw Error("Pinned BVH mismatch");
// These are throwaway local credentials. Never read AWS profile/Keychain or use a cloud endpoint.
Object.assign(process.env, {
  AWS_ACCESS_KEY_ID: "local-qa-only",
  AWS_SECRET_ACCESS_KEY: "local-qa-only",
  AWS_REGION: "us-east-1",
  AWS_ENDPOINT_URL_S3: "http://127.0.0.1:18462",
  AWS_EC2_METADATA_DISABLED: "true",
  ACCESS_GATE_ENABLED: "false",
  BETA_DATA_BUCKET: "personal-local-qa",
  INFERENCE_BASE_URL: "http://127.0.0.1:18463",
  DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused",
});
const load = (file) => import(pathToFileURL(path.join(root, "dist", file)).href);
const { PGlite } = await moduleOf("@electric-sql/pglite");
const { Hono } = await moduleOf("hono");
const { serve } = await moduleOf("@hono/node-server");
const { SCHEMA, pool } = await load("db.js");
const db = new PGlite(path.join(work, "sql"));
await db.exec(SCHEMA);
const query = async (sql, values) => {
  const r = await db.query(sql, values);
  return {
    rows: r.rows,
    rowCount: r.rows.length || r.affectedRows || 0,
    fields: [],
    command: "",
    oid: 0,
  };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const { config } = await load("config.js");
const { createInstallation } = await load("installations/store.js");
const { requireInstallation } = await load("installations/middleware.js");
const { confirmSelections } = await load("analytics/store.js");
const { getOwnedJob } = await load("jobs/store.js");
const { saveRefinedArtifact } = await load("refine/store.js");
const { putRefinedBvh } = await load("refineStorage.js");
const { createPoseRoutes } = await load("pose/routes.js");
const { createAccessRoutes } = await load("access/routes.js");
const { appCors } = await load("cors.js");
const job = "job_personal_hono_sql_20261121",
  sourceSha = process.env.QA_BVH_SHA256;
const now = new Date().toISOString();
const credentials = await readFile(path.join(work, "credentials-private.json"), "utf8")
  .then(JSON.parse)
  .catch(() =>
    createInstallation({
      consentVersion: config.consentVersion,
      consentedAt: now,
      appVersion: "2.10.6",
      osName: "macOS",
      osVersion: "QA",
      architecture: "arm64",
      locale: "ko",
    }),
  );
const other = await createInstallation({
  consentVersion: config.consentVersion,
  consentedAt: now,
  appVersion: "2.10.6",
  osName: "QA",
  osVersion: "QA",
  architecture: "arm64",
  locale: "ko",
});
await writeFile(path.join(work, "credentials-private.json"), JSON.stringify(credentials), {
  mode: 0o600,
});
const rotation = [
  [0.8191520442889918, 0, 0.573576436351046],
  [0, 1, 0],
  [-0.573576436351046, 0, 0.8191520442889918],
];
const candidate = (id, rank, r) => ({
  id,
  poseId: "recorded-pose",
  rank,
  view: "front",
  tags: ["recorded-offline-QA"],
  matchLevel: "similar",
  source: "library",
  sourceBvhSha256: sourceSha,
  lookupAllowed: true,
  releaseAllowed: true,
  refineAllowed: true,
  manualExportAllowed: true,
  reviewRequired: true,
  notExactMatch: false,
  presentationKind: "library_match",
  bvhAvailable: true,
  camera: {
    version: "candidate-camera-v2",
    pose_id: "recorded-pose",
    query_sha256: "a".repeat(64),
    rotation: r,
    source_bvh_sha256: sourceSha,
  },
});
const result = {
  jobId: job,
  notes: ["LOCAL QA: actual Hono/SQL/auth export; recorded inference + loopback object storage"],
  capabilities: {
    fbxExport: true,
    bodyPreviews: true,
    refine: false,
    handSelection: false,
    sceneExport: false,
    characterSelection: false,
    outputScopeCropping: true,
    selectionPreview: true,
    interactivePreview: {
      schemaVersion: "interactive-preview-capability-v1",
      top5: true,
      operations: true,
    },
  },
  candidatesByPerson: [
    {
      personIndex: 0,
      box: null,
      tags: {},
      confidence: "high",
      skeletonState: "valid",
      skeletonSource: "full_image",
      coverageClass: "full",
      fallbackMode: "none",
      refineAllowed: false,
      candidates: [
        candidate("recorded-source", 1, [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]),
        candidate("recorded-yaw35", 2, rotation),
      ],
    },
  ],
};
await db.query(
  "INSERT INTO jobs (id,status,created_at,updated_at,result_json,installation_id) VALUES ($1,'completed',$2,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET result_json=EXCLUDED.result_json",
  [job, now, JSON.stringify(result), credentials.installationId],
);
await db.query(
  "INSERT INTO analysis_people (job_id,person_index,tags_json) VALUES ($1,0,'{}') ON CONFLICT DO NOTHING",
  [job],
);
for (const c of result.candidatesByPerson[0].candidates)
  await db.query(
    "INSERT INTO analysis_candidates (job_id,person_index,candidate_id,pose_id,rank,view,match_level,tags_json,pose_library_version) VALUES ($1,0,$2,$3,$4,'front','similar','[]','local-qa') ON CONFLICT DO NOTHING",
    [job, c.id, c.poseId, c.rank],
  );
await confirmSelections(credentials.installationId, job, [
  { personIndex: 0, candidateId: "recorded-source" },
]);
const objectRoot = path.join(work, "objects");
await mkdir(objectRoot, { recursive: true });
const objectServer = createServer(async (req, res) => {
  const key = new URL(req.url, "http://local").pathname;
  if (!/^\/personal-local-qa\/[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) {
    res.writeHead(400).end();
    return;
  }
  const file = path.join(objectRoot, createHash("sha256").update(key).digest("hex"));
  if (req.method === "PUT") {
    const chunks = [];
    for await (const b of req) chunks.push(b);
    const bytes = Buffer.concat(chunks);
    if (bytes.length > 8 * 1024 * 1024) {
      res.writeHead(413).end();
      return;
    }
    await writeFile(file, bytes);
    res.writeHead(200, { ETag: '"local-qa"' }).end();
  } else {
    try {
      const bytes = await readFile(file);
      res.writeHead(200, { "Content-Length": bytes.length }).end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  }
});
await new Promise((r) => objectServer.listen(18462, "127.0.0.1", r));
let upstreamBytes = source;
const upstream = createServer((req, res) =>
  req.url === "/pose/recorded-pose/bvh"
    ? res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(upstreamBytes)
    : res.writeHead(403).end(),
);
await new Promise((r) => upstream.listen(18463, "127.0.0.1", r));
const quality = {
  version: "2026-10-19",
  personalData: false,
  contentLicense: false,
  consentId: null,
  grantedAt: null,
};
const app = new Hono();
app.use("*", appCors(["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"]));
app.post("/v1/installations", (c) => c.json({ ...credentials, qualityConsent: quality }));
app.use("/v1/*", requireInstallation);
app.use("/v1/*", async (c, next) => {
  const data = c.req.method === "GET" ? "" : await c.req.text();
  if (/localModelId|sourcePath|contentBase64|decoder|cs3c/i.test(data))
    return c.json({ error: { code: "PRIVATE_INPUT_REJECTED" } }, 400);
  await next();
});
app.route("/v1/pose-candidates", createPoseRoutes());
app.route("/v1/installations/current/access", createAccessRoutes());
app.get("/v1/installations/current/quality-consent", (c) => c.json(quality));
app.get("/v1/installations/current/body-preferences", (c) =>
  c.json({
    version: "body-preferences.v1",
    scope: "installation",
    mode: "last_used",
    cards: [],
    lastUsed: null,
    shapeEditable: [],
    revision: 0,
  }),
);
app.get("/v1/models", (c) => c.json({ characters: [], defaultCharacterId: "" }));
app.get("/v1/events/capabilities", (c) => c.json({ journeyVersion: 0, featureUsageVersion: 0 }));
app.get("/v1/semantic-search/capabilities", (c) => c.json({ available: false }));
app.get("/v1/analysis/jobs", (c) =>
  c.json({
    items: [
      {
        jobId: job,
        status: "completed",
        createdAt: now,
        completedAt: now,
        errorCode: null,
        source: "file",
        personCount: 1,
        selectionCount: 1,
        hasSelection: true,
        thumbnailUrl: null,
        inputAvailable: false,
      },
    ],
    nextCursor: null,
  }),
);
app.get(`/v1/analysis/jobs/${job}`, async (c) => {
  const owned = await getOwnedJob(job, c.get("installationId"));
  return owned
    ? c.json({ jobId: job, status: "completed", createdAt: now, updatedAt: now, error: null })
    : c.json({ error: { code: "NOT_FOUND" } }, 404);
});
app.get(`/v1/analysis/jobs/${job}/result`, async (c) => {
  const owned = await getOwnedJob(job, c.get("installationId"));
  return owned ? c.json(owned.result) : c.json({ error: { code: "NOT_FOUND" } }, 404);
});
app.get(`/v1/analysis/jobs/${job}/selections`, async (c) =>
  c.json({
    selections: (
      await db.query(
        "SELECT person_index,candidate_id,rank,confirmed_at FROM confirmed_selections WHERE job_id=$1 AND installation_id=$2",
        [job, c.get("installationId")],
      )
    ).rows.map((r) => ({
      personIndex: r.person_index,
      candidateId: r.candidate_id,
      rank: r.rank,
      confirmedAt: r.confirmed_at,
    })),
  }),
);
app.put(`/v1/analysis/jobs/${job}/selections`, async (c) => {
  const b = await c.req.json();
  return (await confirmSelections(c.get("installationId"), job, b.selections))
    ? c.json({ ok: true })
    : c.json({ error: { code: "INVALID_SELECTION" } }, 409);
});
app.get(`/v1/analysis/jobs/${job}/people/0/body-selection`, (c) =>
  c.json({
    schemaVersion: "body-selection.v1",
    personIndex: 0,
    intent: "inherit",
    manualCharacterId: null,
    recommendation: { status: "disabled", body: null, reasonCodes: ["local_qa"] },
    resolvedBody: null,
    resolvedSource: null,
    resolutionStatus: "needs_selection",
    selectionRevision: 0,
  }),
);
app.get(`/v1/analysis/jobs/${job}/people/0/body-options`, (c) =>
  c.json({ catalogRevision: "local-qa", characters: [] }),
);
const url = `/v1/pose-candidates/recorded-pose/export?jobId=${job}&personIndex=0&candidateId=recorded-source&format=bvh`;
const headers = (c) => ({
  "X-Installation-Id": c.installationId,
  "X-Device-Token": c.deviceToken,
  "X-App-Version": "2.10.6",
});
const request = (c) => app.request(url, { headers: headers(c) });
const evidence = {
  kind: "real BFF export/Hono/SQL/installation auth; offline recorded inference and filesystem S3 protocol substitute",
  bffRoot: root,
  sourceSha,
  checks: [],
};
const check = (name, pass) => {
  assert(pass, name);
  evidence.checks.push({ name, pass });
};
check("missing installation rejected", (await app.request(url)).status === 401);
check("foreign installation rejected", (await request(other)).status === 409);
let response = await request(credentials);
if (response.status !== 200)
  console.log("base diagnostic", response.status, await response.clone().text());
check(
  "verified base BVH exact",
  response.status === 200 &&
    createHash("sha256")
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest("hex") === sourceSha,
);
// A distinct byte sequence persisted through the actual storage SDK and SQL row.
const refined = Buffer.concat([source, Buffer.from("\n")]);
const objectKey = `installations/${credentials.installationId}/jobs/${job}/refined/0/recorded-source.bvh`;
await putRefinedBvh(objectKey, refined);
await saveRefinedArtifact({
  jobId: job,
  personIndex: 0,
  candidateId: "recorded-source",
  poseId: "recorded-pose",
  refined: true,
  reason: "qa_persisted",
  objectKey,
  thumbnailKey: null,
  limbs: [],
});
response = await request(credentials);
if (response.status !== 200)
  console.log("refined diagnostic", response.status, await response.clone().text());
check(
  "persisted refined BVH exact",
  response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(refined),
);
await db.query("DELETE FROM refined_artifacts WHERE job_id=$1", [job]);
check(
  "auth invalid token rejected",
  (await app.request(url, { headers: { ...headers(credentials), "X-Device-Token": "wrong" } }))
    .status === 401,
);
await confirmSelections(credentials.installationId, job, [
  { personIndex: 0, candidateId: "recorded-yaw35" },
]);
check("previous confirmed selection rejected", (await request(credentials)).status === 409);
await confirmSelections(credentials.installationId, job, [
  { personIndex: 0, candidateId: "recorded-source" },
]);
upstreamBytes = Buffer.concat([source, Buffer.from("\n")]);
check("changed source SHA rejected", (await request(credentials)).status === 409);
upstreamBytes = source;
check(
  "wrong person rejected",
  (
    await app.request(url.replace("personIndex=0", "personIndex=1"), {
      headers: headers(credentials),
    })
  ).status === 409,
);
check(
  "wrong pose path rejected",
  (
    await app.request(url.replace("recorded-pose/export", "different-pose/export"), {
      headers: headers(credentials),
    })
  ).status === 409,
);
const counts = await db.query("SELECT count(*)::int AS n FROM export_events WHERE job_id=$1", [
  job,
]);
evidence.sqlExportEvents = counts.rows[0].n;
await writeFile(path.join(work, "evidence.json"), JSON.stringify(evidence, null, 2));
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 18461 });
console.log(
  "Actual BFF Hono/SQL/auth QA ready on 127.0.0.1:18461; offline dependencies; no production",
);
