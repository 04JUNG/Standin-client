// @vitest-environment node
/** Opt-in actual client HTTP + disposable owned SQL/Hono + actual Converter worker/skin/outline.
 * Driver is private local QA setup, with no certification/receipt replacement. Native save is separate.
 */
import process from "node:process";
import { Buffer } from "node:buffer";
import { it, expect, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { interactiveHttp } from "../src/features/pose-viewer/interactive/http";
import { setInstallationCredentials } from "../src/shared/api/client";
const driver = process.env.STANDIN_SKIN_DRIVER;
it.skipIf(!driver)(
  "verifies actual skin-only/combined final bytes with current preview asset and stale fences",
  async () => {
    const tcpFetch = globalThis.fetch;
    const qa = await import(/* @vite-ignore */ pathToFileURL(driver).href);
    vi.stubGlobal("fetch", (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.startsWith("/v1/analysis/jobs/"))
        return tcpFetch("http://127.0.0.1:18492" + url.pathname + url.search, options);
      return tcpFetch(input, options);
    });
    setInstallationCredentials({ installationId: qa.owner, deviceToken: qa.secret });
    const signal = new AbortController().signal,
      target = { jobId: qa.jobId, personIndex: 0 };
    try {
      const head = await interactiveHttp.head(target, qa.candidate.pose_id, signal);
      expect(head.skinExport?.available).toBe(true);
      expect(head.skinExport?.supportedIds).toContain("flesh-guide");
      let previous = null;
      const evidence = [];
      const cases =
        process.env.STANDIN_SKIN_WIRE_STYLES === "extra"
          ? [
              ["gray-guide", 2],
              ["flesh", 2],
              ["muscle", 2],
            ]
          : [
              ["flesh-guide", 0],
              ["flesh-guide", 2],
            ];
      for (const [index, [id, width]] of cases.entries()) {
        const skin = { version: "fbx-skin-v1", id };
        let op = await interactiveHttp.prepare(target, {
          schemaVersion: "standin.interactive-http.v1",
          candidateId: qa.candidate.pose_id,
          revision: index + 1,
          expectedRevision: previous?.revision ?? 0,
          expectedStateHash: previous?.stateHash ?? null,
          mutationId: "client-skin-wire-" + index,
          skin,
          ...(width ? { appearance: { version: "fbx-outline-v1", width } } : {}),
        });
        await qa.service.tick("preview");
        op = await interactiveHttp.poll(target, op, signal);
        expect(op.previewState, op.errorCode ?? "").toBe("authoritative");
        const model = await interactiveHttp.model(target, op, qa.candidate.pose_id, signal);
        expect(model.state.identity.scope).toBe("full");
        expect(model.state.model.meshes[0].positions.length).toBe(24988);
        for (const asset of [op.skinPreview.uv, op.skinPreview.texture]) {
          const response = await tcpFetch("http://127.0.0.1:18492" + asset.url, {
            headers: {
              "X-Installation-Id": qa.owner,
              "X-Device-Token": qa.secret,
              "X-App-Version": "0.2.3",
            },
          });
          expect(response.status).toBe(200);
          expect(response.headers.get("X-Skin-Asset-SHA256")).toBe(asset.sha256);
        }
        op = await interactiveHttp.export(target, op, signal);
        await qa.service.tick("export");
        op = await interactiveHttp.poll(target, op, signal);
        expect(op.exportState, op.errorCode ?? "").toBe("ready");
        const file = await interactiveHttp.file(target, op, signal);
        expect(Buffer.from(file.bytes).subarray(0, 18).toString()).toBe("Kaydara FBX Binary");
        expect(op.exportReceipt.skinProof.proof.csp_certified).toBe(true);
        expect(op.exportReceipt.skinProof.proof.base.maxPositionErrorM).toBe(0);
        if (width)
          expect(op.exportReceipt.outline.sourceArtifactSha256).toBe(
            op.exportReceipt.skinProof.artifactSha256,
          );
        if (previous)
          await expect(interactiveHttp.file(target, previous, signal)).rejects.toBeDefined();
        const output = process.env.STANDIN_SKIN_WIRE_OUTPUT;
        if (output) {
          await writeFile(`${output}-${skin.id}-${width}.fbx`, file.bytes);
          await writeFile(
            `${output}-${skin.id}-${width}.operation.json`,
            JSON.stringify(op, null, 2),
          );
          await writeFile(
            `${output}-${skin.id}-${width}.packet.json`,
            JSON.stringify(model.packet),
          );
        }
        evidence.push({
          width,
          skin: skin.id,
          sha256: file.receipt.artifactSha256,
          bytes: file.bytes.length,
          nativeSaved: false,
        });
        previous = op;
      }
      if (process.env.STANDIN_SKIN_WIRE_OUTPUT)
        await writeFile(
          process.env.STANDIN_SKIN_WIRE_OUTPUT + "-evidence.json",
          JSON.stringify(
            {
              method:
                "actual client HTTP over loopback Hono/installation middleware + PGlite controlled source selection + actual Converter/Blender skin/outline final files",
              cases: evidence,
              limits: [
                "controlled local auth/source/SQL/S3 driver",
                "native persistence and CSP import are separate stages",
              ],
            },
            null,
            2,
          ),
        );
    } finally {
      setInstallationCredentials(null);
      vi.unstubAllGlobals();
      await qa.close();
    }
  },
  300000,
);
