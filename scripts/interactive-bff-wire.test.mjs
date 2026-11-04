// @vitest-environment node
/** Opt-in cross-repository protocol integration: real BFF Hono/SQL + actual client HTTP adapter.
 * Controlled synthetic worker; explicitly not Blender/FBX safety/native evidence.
 * STANDIN_BFF_WORKTREE=/path/to/built/BFF NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-bff-wire.test.mjs
 */
import { it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);
import { interactiveHttp } from "../src/features/pose-viewer/interactive/http";
import { setInstallationCredentials } from "../src/shared/api/client";
const root = process.env.STANDIN_BFF_WORKTREE;
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
    const db = new PGlite();
    await db.exec(
      `CREATE TABLE installations(id TEXT PRIMARY KEY);CREATE TABLE jobs(id TEXT PRIMARY KEY,installation_id TEXT,status TEXT);INSERT INTO installations VALUES('fixture_owner');INSERT INTO jobs VALUES('job_fixture','fixture_owner','completed');${INTERACTIVE_SCHEMA}`,
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
    const service = new InteractiveService({
      store,
      resolve: async () => fixture.fixtureSelection(hash("selection")),
      worker: {
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
    setInstallationCredentials({ installationId: "fixture_owner", deviceToken: "local-fixture" });
    try {
      const target = { jobId: "job_fixture", personIndex: 0 },
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
      const model = await interactiveHttp.model(target, op, "candidate", signal);
      expect(model.state.model.meshes[0].positions.length).toBe(3);
      op = await interactiveHttp.export(target, op, signal);
      await service.tick("export");
      op = await interactiveHttp.poll(target, op, signal);
      expect(op.exportState).toBe("ready");
      expect(op.exportReceipt.nativeSaved).toBe(false);
      const file = await interactiveHttp.file(target, op, signal);
      expect(Buffer.from(file.bytes).equals(fixture.syntheticFbx)).toBe(true);
      await interactiveHttp.cancel(target, op);
      await expect(interactiveHttp.file(target, op, signal)).rejects.toBeDefined();
    } finally {
      setInstallationCredentials(null);
      vi.unstubAllGlobals();
      await db.close();
    }
  },
  15000,
);
