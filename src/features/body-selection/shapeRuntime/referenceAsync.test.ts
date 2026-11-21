import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceRuntime } from "./referenceFormat";
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  terminate = vi.fn();
  constructor() {
    instances.push(this);
  }
  postMessage(value: unknown) {
    this.sent.push(value);
  }
  emit(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent);
  }
}
const runtime = (sha = "a"): ReferenceRuntime =>
  ({
    kind: "reference",
    header: { rawSha256: sha, vertexCount: 1 },
    compressed: new Uint8Array(),
    faces: new Uint16Array(),
  }) as unknown as ReferenceRuntime;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  instances.length = 0;
  vi.resetModules();
});
describe("bounded reference worker", () => {
  it("serializes thumbnail and live requests in one worker and releases idle graph memory", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { computeReferenceAsync } = await import("./referenceAsync");
    const a = computeReferenceAsync(runtime(), { muscle: 1 }),
      b = computeReferenceAsync(runtime(), { muscle: 2 });
    expect(instances).toHaveLength(1);
    const worker = instances[0];
    expect(worker.sent).toHaveLength(1);
    worker.emit({ kind: "ready" });
    expect(worker.sent[1]).toEqual({ kind: "compute", controls: { muscle: 1 } });
    worker.emit({ kind: "result", positions: new Float32Array([1, 2, 3]), computeMs: 12 });
    await expect(a).resolves.toMatchObject({ computeMs: 12 });
    expect(worker.sent[2]).toEqual({ kind: "compute", controls: { muscle: 2 } });
    worker.emit({ kind: "result", positions: new Float32Array([4, 5, 6]), computeMs: 13 });
    await b;
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30001);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("rejects the queue on a worker failure and can start a fresh worker", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { computeReferenceAsync } = await import("./referenceAsync");
    const a = computeReferenceAsync(runtime(), {}),
      b = computeReferenceAsync(runtime(), {});
    const rejected = Promise.all([
      expect(a).rejects.toThrow(/calculation failed/),
      expect(b).rejects.toThrow(/calculation failed/),
    ]);
    instances[0].emit({ kind: "error" });
    await rejected;
    expect(instances[0].terminate).toHaveBeenCalledOnce();
    const next = computeReferenceAsync(runtime(), {});
    expect(instances).toHaveLength(2);
    instances[1].emit({ kind: "ready" });
    instances[1].emit({ kind: "result", positions: new Float32Array(3), computeMs: 1 });
    await next;
    await vi.advanceTimersByTimeAsync(30001);
  });
  it("recovers when the environment cannot create a worker", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("unavailable");
        }
      },
    );
    const { computeReferenceAsync } = await import("./referenceAsync");
    await expect(computeReferenceAsync(runtime(), {})).rejects.toThrow(/calculation failed/);
    await expect(computeReferenceAsync(runtime(), {})).rejects.toThrow(/calculation failed/);
  });
});

describe("reference load validation", () => {
  it("returns only validated preview indices and terminates the temporary decoder", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { parseReferenceAsync } = await import("./referenceAsync");
    const { default: header } = await import("./__fixtures__/female-reference-header.json");
    const result = parseReferenceAsync(header, new Uint8Array([1, 2]));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const faces = new Uint16Array(header.faceCount * 3);
    instances[0].emit({ kind: "ready", faces });
    await expect(result).resolves.toMatchObject({ kind: "reference", faces });
    expect(instances[0].terminate).toHaveBeenCalledOnce();
  });
});
