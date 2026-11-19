import { describe, expect, it, vi } from "vitest";
import { readSelectedRefineResponse } from "./selectedRefineProgress";
import { exampleSkeleton } from "@/dev/analysis-progress-fixture";
const identity = { jobId: "job", personIndex: 1, candidateId: "pick" };
const event = (phase: string, change = {}) => ({ type: "progress", ...identity, phase, ...change });
function stream(events: object[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split UTF-8/JSON arbitrarily, as real HTTP delivery does.
        const bytes = new TextEncoder().encode(
          events.map((e) => JSON.stringify(e)).join("\n") + "\n",
        );
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}
describe("selected refine wire", () => {
  it("passes only valid observed targets from the bound refining event and clears them for preparing", async () => {
    const target = {
      version: "selected-refine-target.v1",
      width: 250,
      height: 315,
      skeleton: exampleSkeleton,
      targetJoints: [8, 10],
    };
    const onProgress = vi.fn();
    await readSelectedRefineResponse(
      stream([
        event("refining", { target }),
        event("preparing", { target }),
        { type: "result", status: 200, body: {} },
      ]),
      { ...identity, onProgress },
    );
    expect(onProgress.mock.calls).toEqual([["refining", target], ["preparing"]]);
    for (const bad of [
      { ...target, width: 0 },
      { ...target, targetJoints: [8, 8] },
      { ...target, targetJoints: [99] },
      { ...target, skeleton: { ...exampleSkeleton, points: Array(17).fill(null) } },
    ]) {
      const observed = vi.fn();
      await readSelectedRefineResponse(
        stream([event("refining", { target: bad }), { type: "result", status: 200, body: {} }]),
        { ...identity, onProgress: observed },
      );
      expect(observed).toHaveBeenCalledWith("refining");
    }
    const stale = vi.fn();
    await expect(
      readSelectedRefineResponse(stream([event("refining", { candidateId: "old", target })]), {
        ...identity,
        onProgress: stale,
      }),
    ).rejects.toThrow("selection");
    expect(stale).not.toHaveBeenCalled();
  });
  it("uses only matching server events and returns the terminal response", async () => {
    const onProgress = vi.fn();
    const body = { ...identity, refined: false, reasonCode: "no_gain" };
    expect(
      await readSelectedRefineResponse(
        stream([event("refining"), event("preparing"), { type: "result", status: 200, body }]),
        { ...identity, onProgress },
      ),
    ).toEqual(body);
    expect(onProgress.mock.calls).toEqual([["refining"], ["preparing"]]);
  });
  it("old BFF JSON and skipped streams never imply a running operation", async () => {
    const onProgress = vi.fn();
    for (const response of [
      new Response(JSON.stringify({ refined: false })),
      stream([{ type: "result", status: 200, body: { refined: false } }]),
    ])
      await readSelectedRefineResponse(response, { ...identity, onProgress });
    expect(onProgress).not.toHaveBeenCalled();
  });
  it.each([{ jobId: "old" }, { personIndex: 0 }, { candidateId: "old" }])(
    "rejects mixed ownership %s",
    async (change) => {
      const onProgress = vi.fn();
      await expect(
        readSelectedRefineResponse(stream([event("refining", change)]), {
          ...identity,
          onProgress,
        }),
      ).rejects.toThrow("selection");
      expect(onProgress).not.toHaveBeenCalled();
    },
  );
  it("truncation, server failure and cancellation cannot become completion", async () => {
    await expect(readSelectedRefineResponse(stream([event("refining")]), identity)).rejects.toThrow(
      "without result",
    );
    await expect(
      readSelectedRefineResponse(
        stream([{ type: "result", status: 503, body: { error: { code: "REFINE_UNAVAILABLE" } } }]),
        identity,
      ),
    ).rejects.toMatchObject({ code: "REFINE_UNAVAILABLE" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSelectedRefineResponse(stream([event("refining")]), {
        ...identity,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
