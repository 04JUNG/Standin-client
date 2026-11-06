// @vitest-environment node
/** Opt-in cross-repository protocol integration: real BFF Hono/SQL + actual client HTTP adapter.
 * Optional STANDIN_REAL_PACKET_DIR + STANDIN_REAL_BVH_FILE uses live local Converter.
 * Default controlled synthetic worker; explicitly not Blender/FBX safety/native evidence.
 * STANDIN_BFF_WORKTREE=/path/to/built/BFF NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-bff-wire.test.mjs
 */
import { it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);
import { interactiveHttp } from "../src/features/pose-viewer/interactive/http";
import { setInstallationCredentials } from "../src/shared/api/client";
const root = process.env.STANDIN_BFF_WORKTREE;
const realDirectory = process.env.STANDIN_REAL_PACKET_DIR;
const networkFetch = globalThis.fetch;
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
it.skipIf(!root)(
  "actual BFF routes and SQL queue exchange head/prepare/packet/receipt/verified bytes with Client",
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
      const body = { characterId: id.body.characterId, assetSha256: id.body.characterSha256 };
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
    const service = new InteractiveService({
      store,
      resolve: async () => selection,
      worker: realWorker ?? {
        solve: async (_s, op) => ({ snapshotId: "fixture", packet: fixture.fixturePacket(op) }),
        model: async (op) => Buffer.from(JSON.stringify(fixture.fixturePacket(op))),
        export: async (op) => fixture.fixtureReceipt(op),
        file: async () => fixture.syntheticFbx,
        cancel: async () => {},
      },
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
      expect(head.appearanceExport?.available).not.toBe(true);
      for (const width of [0.5, 1, 2]) {
        await expect(
          interactiveHttp.prepare(target, {
            schemaVersion: "standin.interactive-http.v1",
            candidateId: "candidate",
            revision: op.revision + 1,
            expectedRevision: op.revision,
            expectedStateHash: op.stateHash,
            mutationId: `outline-blocked-${String(width).replace(".", "_")}`,
            appearance: { version: "fbx-outline-v1", width },
          }),
        ).rejects.toMatchObject({ code: "OUTLINE_DISABLED" });
      }
      // Refused nonzero settings neither supersede nor replace the last good zero file.
      const retained = await interactiveHttp.file(target, op, signal);
      expect(retained.receipt.artifactSha256).toBe(file.receipt.artifactSha256);
      if (realDirectory && process.env.STANDIN_CLIENT_WIRE_OUTPUT) {
        await writeFile(process.env.STANDIN_CLIENT_WIRE_OUTPUT, file.bytes);
        await writeFile(
          process.env.STANDIN_CLIENT_WIRE_OUTPUT + ".json",
          JSON.stringify(
            {
              kind: "actual client adapter + Hono in-process routes/PGlite + live Converter TCP/Blender; fixture selection/edge auth",
              artifactSha256: file.receipt.artifactSha256,
              artifactBytes: file.bytes.length,
              zeroReady: true,
              nonzeroRefused: [0.5, 1, 2],
              outlineCapability: head.appearanceExport ?? null,
              noCspCertification: true,
              nativeSaved: false,
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
