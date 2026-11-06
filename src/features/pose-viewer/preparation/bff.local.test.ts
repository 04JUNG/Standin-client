// @vitest-environment node
import { writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { expect, it, vi } from "vitest";
import { preparationHttp } from "./http";
import { readBatch, type CandidateIdentity } from "./contract";
import { loadPreparedSource } from "./sourcePreview";
import { reusePreparedSelection } from "./reuse";
import type { AnalysisResult, PoseCandidate } from "../api/pose.contract";

/** Real disposable BFF routes + SQL. Engine is controlled; no target/FBX claim. */
it.skipIf(!process.env.CANDIDATE_WIRE_URL)(
  "consumes BFF preparation/reuse and exact source bytes over localhost HTTP",
  async () => {
    const origin = process.env.CANDIDATE_WIRE_URL!,
      nativeFetch = globalThis.fetch;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", (url: string | URL | Request, options?: RequestInit) => {
      const parsed = new URL(String(url), origin);
      return nativeFetch(new URL(parsed.pathname + parsed.search, origin), options);
    });
    try {
      const before = await (await nativeFetch(origin + "/__fixture/state")).json();
      const expected: CandidateIdentity[] = before.rows;
      const currentResponse = await nativeFetch(origin + before.base);
      const current = await currentResponse.json();
      const batch = await preparationHttp.prepare(
        "job_fixture",
        crypto.randomUUID(),
        current.revision ?? 0,
        expected,
        new AbortController().signal,
      );
      let ready = batch;
      for (let count = 0; count < 30 && !ready.top5Ready; count++) {
        await new Promise((done) => setTimeout(done, 200));
        ready = await preparationHttp.status(
          "job_fixture",
          batch.batchId,
          expected,
          new AbortController().signal,
        );
      }
      expect(ready.top5Ready).toBe(true);
      expect(ready.total).toBe(15);
      readBatch(ready, expected);
      const selected = ready.candidates.filter((c) => c.candidateId.endsWith("_0"));
      const result: AnalysisResult = {
        jobId: "job_fixture",
        people: selected.map((c) => ({
          index: c.personIndex,
          candidates: [
            { id: c.candidateId, bvhUrl: "/v1/pose-candidates/source/export" } as PoseCandidate,
          ],
          confidence: "high",
          skeletonState: "valid",
          skeletonSource: "full_image",
          coverageClass: "full",
          fallbackMode: "none",
          refineAllowed: true,
          refinableLimbs: [],
        })),
        capabilities: {
          refine: true,
          fbxExport: false,
          characterSelection: false,
          candidatePreparation: true,
        },
      };
      const picks = Object.fromEntries(selected.map((c) => [c.personIndex, c.candidateId]));
      const afterPrepared = await (await nativeFetch(origin + "/__fixture/state")).json();
      const outcomes = await reusePreparedSelection(
        result,
        ready,
        picks,
        new AbortController().signal,
      );
      const downloads = [];
      for (const c of selected) {
        const source = await loadPreparedSource(c.previewAsset!, new AbortController().signal);
        expect(source.sha256).toBe(c.outputSha256);
        expect(outcomes[c.personIndex].prepared?.outputSha256).toBe(source.sha256);
        downloads.push({
          personIndex: c.personIndex,
          candidateId: c.candidateId,
          sha256: source.sha256,
          bytes: new TextEncoder().encode(source.text).length,
        });
      }
      const joined = await preparationHttp.prepare(
        "job_fixture",
        crypto.randomUUID(),
        ready.revision,
        expected,
        new AbortController().signal,
      );
      expect(joined.batchId).toBe(ready.batchId);
      const after = await (await nativeFetch(origin + "/__fixture/state")).json();
      expect(after.calls).toBe(afterPrepared.calls);
      const denied = await nativeFetch(origin + before.base, {
        headers: { "X-Test-Owner": "inst_other" },
      });
      expect(denied.status).toBe(404);
      const report = {
        kind: before.kind,
        people: before.people,
        candidates: ready.total,
        chunks: after.chunks,
        downloads,
        sourceCandidateSolveCallsBefore: before.calls,
        sourceCandidateSolveCallsAfterPrepare: afterPrepared.calls,
        sourceCandidateSolveCallsAfterSelect: after.calls,
        selectedAdditionalSourceCalls: after.calls - afterPrepared.calls,
        sourceOnly: true,
        targetApplied: false,
        finalFileVerified: false,
        limitations: [
          "Controlled source engine; real Hono + PGlite SQL",
          "No production authentication, paid inference, target or final FBX execution",
        ],
      };
      if (process.env.CANDIDATE_WIRE_OUTPUT)
        await writeFile(process.env.CANDIDATE_WIRE_OUTPUT, JSON.stringify(report, null, 2) + "\n");
    } finally {
      vi.unstubAllGlobals();
    }
  },
  20000,
);
