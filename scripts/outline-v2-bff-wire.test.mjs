// @vitest-environment node
/** Opt-in cross-repository protocol integration: real BFF Hono/SQL + actual client HTTP adapter.
 * Requires STANDIN_OUTLINE_V2_FIXTURE plus actual local Converter for solve/export/postprocess.
 * Opt-in only: no synthetic worker is used; native write remains a separate recorded stage.
 * STANDIN_BFF_WORKTREE=/path/to/built/BFF NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-bff-wire.test.mjs
 */
import process from "node:process";
import { Buffer } from "node:buffer";
import { it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);
import { interactiveHttp } from "../src/features/pose-viewer/interactive/http";
import { setInstallationCredentials } from "../src/shared/api/client";
const root = process.env.STANDIN_BFF_WORKTREE;
const v2Fixture = process.env.STANDIN_OUTLINE_V2_FIXTURE;
const realDirectory = process.env.STANDIN_REAL_PACKET_DIR;
const networkFetch = async (...args) => {
  const response = await tcpFetch(...args);
  if (!response.ok) console.error("Local Converter diagnostic HTTP", response.status);
  return response;
};
const tcpFetch = globalThis.fetch;
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
it.skipIf(!root || !v2Fixture || !realDirectory)(
  "actual v2 BFF postprocess and client adapter verify nonzero file bytes",
  async () => {
    const [
      { Hono },
      { PGlite },
      { OperationStore },
      { INTERACTIVE_SCHEMA },
      { InteractiveService },
      { createInteractiveRoutes },
      fixture,
      { hash },
    ] = await Promise.all([
      Promise.resolve(nativeRequire(`${root}/node_modules/hono/dist/index.js`)),
      Promise.resolve(nativeRequire(`${root}/node_modules/@electric-sql/pglite/dist/index.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/store.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/schema.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/service.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/routes.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/fixture.js`)),
      Promise.resolve(nativeRequire(`${root}/dist/interactive-state/model.js`)),
    ]);
    const suffix = realDirectory ? "_" + randomUUID().replaceAll("-", "").slice(0, 12) : "";
    const owner = "fixture_owner" + suffix,
      job = "job_fixture" + suffix;
    const db = new PGlite();
    await db.exec(
      `CREATE TABLE installations(id TEXT PRIMARY KEY);CREATE TABLE jobs(id TEXT PRIMARY KEY,installation_id TEXT,status TEXT);INSERT INTO installations VALUES('${owner}');INSERT INTO jobs VALUES('${job}','${owner}','completed');${INTERACTIVE_SCHEMA}`,
    );
    const store = new OperationStore((fn) =>
      db.transaction((tx) =>
        fn({
          query: (sql, args) =>
            sql.includes("pg_advisory_xact_lock")
              ? Promise.resolve({ rows: [] })
              : tx.query(sql, args),
        }),
      ),
    );
    let selection = fixture.fixtureSelection(hash("selection"));
    let realWorker;
    let realOutline;
    const outlineFixture = JSON.parse(await readFile(v2Fixture, "utf8"));
    if (realDirectory) {
      const { createInteractiveWorker } = nativeRequire(`${root}/dist/converter/interactive.js`);
      const person = JSON.parse(
        await readFile(path.join(realDirectory, "recorded-person.private.json"), "utf8"),
      );
      const packet = JSON.parse(
        await readFile(path.join(realDirectory, "case-0.packet.private.json"), "utf8"),
      );
      const id = JSON.parse(packet.canonicalState).identity;
      const candidate = person.candidates[0];
      const bvhBytes = new Uint8Array(await readFile(process.env.STANDIN_REAL_BVH_FILE));
      const sourceSha = createHash("sha256").update(bvhBytes).digest("hex");
      expect(sourceSha).toBe(candidate.camera.source_bvh_sha256);
      const current = outlineFixture.cases.find((c) => c.name === "male-neutral-0.65").fields;
      const body = { characterId: current.character_id, assetSha256: current.character_sha256 };
      const hands = {
        left: "relaxed",
        right: "relaxed",
        library_sha256: id.hands.librarySha256,
        library_version: "1",
        revision: 1,
      };
      const identity = {
        schema: "interactive-selection-v1",
        ownerBinding: hash({ installationId: owner, jobId: job, personIndex: 0 }),
        candidateId: "candidate",
        source: {
          originalBvhSha256: sourceSha,
          outputBvhSha256: sourceSha,
          variant: "base",
          refine: null,
        },
        body,
        bodyRevision: 1,
        shape: null,
        shapeSource: null,
        hands,
        scope: "full",
        camera: candidate.camera,
        mirror: false,
        runtime: {},
        model: { characterSha256: id.body.characterSha256 },
      };
      selection = {
        identity,
        selectionHash: hash(identity),
        bvhBytes,
        characterId: body.characterId,
        body: { resolvedBody: body, shape: null, shapeSource: null },
        hands,
        scope: "full",
        camera: candidate.camera,
        originalSha: sourceSha,
        sourceSha,
        runtime: {},
        model: identity.model,
      };
      realWorker = createInteractiveWorker({
        baseUrl: process.env.STANDIN_REAL_CONVERTER_URL || "http://127.0.0.1:18436",
        token: (
          await readFile(
            process.env.STANDIN_REAL_CONVERTER_TOKEN_FILE ||
              path.join(realDirectory, "service-token"),
            "utf8",
          )
        ).trim(),
        fetch: networkFetch,
        timeoutMs: 300000,
      });
    }
    const { createOutlineArtifacts } = nativeRequire(`${root}/dist/converter/outline.js`);
    const records = new Map();
    realOutline = createOutlineArtifacts({
      enabled: () => true,
      baseUrl: outlineFixture.url,
      token: (await readFile(outlineFixture.token_file, "utf8")).trim(),
      timeoutMs: 300000,
      stature: () => 1.78,
      fetch: networkFetch,
      storage: {
        load: async (_op, key) => records.get(key) ?? null,
        publish: async (_op, key, value) => {
          records.set(key, value);
          return value;
        },
      },
    });
    const service = new InteractiveService({
      outline: realOutline,
      store,
      resolve: async () => selection,
      worker: realWorker,
      posters: {
        publishAuxiliary: async () => {},
        publish: async () => ({ sha256: hash("png"), renderer: "fixture" }),
        read: async () => Buffer.from("png"),
      },
      renderPoster: async () => Buffer.from("png"),
      metric: () => {},
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("installationId", c.req.header("X-Installation-Id"));
      c.set("requestId", "fixture");
      await next();
    });
    app.route(
      "/v1/analysis/jobs",
      createInteractiveRoutes(service, () => true),
    );
    vi.stubGlobal("fetch", (input, options) => app.fetch(new Request(input, options)));
    setInstallationCredentials({ installationId: owner, deviceToken: "local-fixture" });
    try {
      const target = { jobId: job, personIndex: 0 },
        signal = new AbortController().signal;
      expect((await interactiveHttp.head(target, "candidate", signal)).currentRevision).toBe(0);
      let op = await interactiveHttp.prepare(target, {
        schemaVersion: "standin.interactive-http.v1",
        candidateId: "candidate",
        revision: 1,
        expectedRevision: 0,
        expectedStateHash: null,
        mutationId: "fixture-mutation",
      });
      await service.tick("preview");
      op = await interactiveHttp.poll(target, op, signal);
      expect(
        op.previewState,
        JSON.stringify({ previewState: op.previewState, errorCode: op.errorCode }),
      ).toBe("authoritative");
      const model = await interactiveHttp.model(target, op, "candidate", signal);
      expect(model.state.model.meshes[0].positions.length).toBeGreaterThan(
        realDirectory ? 1000 : 2,
      );
      if (realDirectory) expect(model.frame?.projectionIncludesCenterScaleCrop).toBe(true);
      op = await interactiveHttp.export(target, op, signal);
      await service.tick("export");
      op = await interactiveHttp.poll(target, op, signal);
      expect(op.exportState).toBe("ready");
      expect(op.exportReceipt.nativeSaved).toBe(false);
      const file = await interactiveHttp.file(target, op, signal);
      if (realDirectory) {
        expect(file.receipt.artifactSha256).toBe(op.exportReceipt.artifactSha256);
        expect(Buffer.from(file.bytes).subarray(0, 18).toString()).toBe("Kaydara FBX Binary");
      } else expect(Buffer.from(file.bytes).equals(fixture.syntheticFbx)).toBe(true);
      const head = await interactiveHttp.head(target, "candidate", signal);
      expect(head.appearanceExport?.available).toBe(true);
      op = await interactiveHttp.prepare(target, {
        schemaVersion: "standin.interactive-http.v1",
        candidateId: "candidate",
        revision: op.revision + 1,
        expectedRevision: op.revision,
        expectedStateHash: op.stateHash,
        mutationId: "v2-continuous-065",
        appearance: { version: "fbx-outline-v1", width: 0.65 },
      });
      await service.tick("preview");
      op = await interactiveHttp.poll(target, op, signal);
      expect(op.previewState, op.errorCode ?? "preview").toBe("authoritative");
      await interactiveHttp.model(target, op, "candidate", signal);
      op = await interactiveHttp.export(target, op, signal);
      await service.tick("export");
      op = await interactiveHttp.poll(target, op, signal);
      expect(op.exportState, op.errorCode ?? "export").toBe("ready");
      expect(op.exportReceipt.outline.proof.csp_certified).toBe(true);
      expect(op.exportReceipt.outline.expression).toBe(
        "skinned-outward-transparent-native-outline-v2",
      );
      expect(op.exportReceipt.outline.proof.binding_sha256).not.toBe("0".repeat(64));
      const outlined = await interactiveHttp.file(target, op, signal);
      expect(outlined.receipt.artifactSha256).toBe(op.exportReceipt.artifactSha256);
      expect(outlined.receipt.artifactSha256).not.toBe(file.receipt.artifactSha256);
      expect(Buffer.from(outlined.bytes).subarray(0, 18).toString()).toBe("Kaydara FBX Binary");
      if (process.env.STANDIN_CLIENT_WIRE_OUTPUT) {
        await writeFile(process.env.STANDIN_CLIENT_WIRE_OUTPUT, outlined.bytes);
        await writeFile(
          process.env.STANDIN_CLIENT_WIRE_OUTPUT + ".receipt.json",
          JSON.stringify(op.exportReceipt.outline, null, 2),
        );
        await writeFile(
          process.env.STANDIN_CLIENT_WIRE_OUTPUT + ".json",
          JSON.stringify(
            {
              kind: "actual client adapter + real Hono/PGlite in-process + actual Converter TCP/Blender solve/export/postprocess; controlled source/selection/edge-auth and in-memory outline storage",
              appearance: op.appearance,
              artifactSha256: outlined.receipt.artifactSha256,
              artifactBytes: outlined.bytes.length,
              expression: op.exportReceipt.outline.expression,
              zeroSha256: file.receipt.artifactSha256,
              finalProofValidated: true,
              bindingNonzero: true,
              nativeSaved: false,
              globalEnabled: false,
              limits: [
                "not production auth/PostgreSQL advisory locks/S3",
                "native write is a separately recorded stage",
              ],
            },
            null,
            2,
          ),
        );
      }
      await interactiveHttp.cancel(target, op);
      await expect(interactiveHttp.file(target, op, signal)).rejects.toBeDefined();
    } finally {
      setInstallationCredentials(null);
      vi.unstubAllGlobals();
      await db.close();
    }
  },
  realDirectory ? 300000 : 15000,
);
