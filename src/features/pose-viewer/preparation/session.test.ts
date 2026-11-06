import { afterEach, expect, it, vi } from "vitest";
import { PreparationSession } from "./session";
import { readBatch } from "./contract";
import { batchFixture, identities } from "./fixtures.testSupport";
afterEach(() => vi.useRealTimers());
it("joins the same in-flight context across app/bar and retains five independent results", async () => {
  const batch = batchFixture(),
    prepare = vi.fn(async () => batch);
  const session = new PreparationSession("job_test", { prepare, status: vi.fn(), cancel: vi.fn() });
  session.activate("source-context", identities(batch));
  session.activate("source-context", identities(batch));
  await vi.waitFor(() => expect(session.snapshot().status).toBe("ready"));
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(session.snapshot().batch?.candidates).toHaveLength(5);
  session.activate("source-context", identities(batch));
  expect(prepare).toHaveBeenCalledTimes(1);
  session.cancel();
});
it("rejects late old context responses and cancels the remote batch", async () => {
  const first = batchFixture(),
    second = { ...batchFixture(2), batchId: "batch-new" };
  let resolve!: (value: typeof first) => void;
  const pending = new Promise<typeof first>((done) => {
    resolve = done;
  });
  const cancel = vi.fn(async () => {}),
    prepare = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(second);
  const session = new PreparationSession("job_test", { prepare, status: vi.fn(), cancel });
  session.activate("old", identities(first));
  session.activate("new", identities(second));
  await vi.waitFor(() => expect(session.snapshot().binding).toBe("new"));
  resolve(first);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith("job_test", first.batchId));
  expect(session.snapshot().batch?.batchId).toBe("batch-new");
  session.cancel();
});
it("closes the barrier on partial, mixed source, duplicate or fabricated ready batches", () => {
  const batch = batchFixture(3),
    expected = identities(batch);
  expect(readBatch(batch, expected).total).toBe(15);
  for (const changed of [
    { ...batch, candidates: batch.candidates.slice(0, 10) },
    { ...batch, terminal: 14 },
    {
      ...batch,
      candidates: batch.candidates.map((c, i) => (i ? c : { ...c, sourceSha256: "d".repeat(64) })),
    },
    {
      ...batch,
      candidates: batch.candidates.map((c, i) => (i ? c : { ...c, previewAsset: null })),
    },
    { ...batch, candidates: [batch.candidates[0], ...batch.candidates.slice(0, 14)] },
  ])
    expect(() => readBatch(changed, expected)).toThrow();
});
it("does not turn timeout into success and permits explicit retry", async () => {
  const batch = batchFixture(),
    prepare = vi.fn().mockRejectedValueOnce(Error("timeout")).mockResolvedValueOnce(batch);
  const session = new PreparationSession("job_test", { prepare, status: vi.fn(), cancel: vi.fn() });
  session.activate("source", identities(batch));
  await vi.waitFor(() => expect(session.snapshot().status).toBe("failed"));
  session.retry();
  await vi.waitFor(() => expect(session.snapshot().status).toBe("ready"));
  session.cancel();
});
