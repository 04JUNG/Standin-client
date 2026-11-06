import { beforeEach, expect, it, vi } from "vitest";
import { apiFetchResponse } from "@/shared/api/client";
import fixture from "./__fixtures__/bff-converter-packet.json";
import type { BodySelection } from "@/features/body-selection/contract";
import type { PoseCandidate } from "../api/pose.contract";
import { loadSelectionPacket } from "./selectionPacket";
vi.mock("@/shared/api/client", () => ({ apiFetchResponse: vi.fn() }));
const identity = fixture.receipt.identity;
const selection = {
  personIndex: 0,
  selectionRevision: 3,
  resolvedBody: {
    characterId: identity.body.characterId,
    assetSha256: identity.body.characterSha256,
  },
  shape: null,
} as BodySelection;
const candidate = {
  id: identity.selection.candidate,
  sourceBvhSha256: identity.source.originalBvhSha256,
} as PoseCandidate;
let packet: typeof fixture.packet;
beforeEach(async () => {
  vi.clearAllMocks();
  const typed = JSON.parse(fixture.packet.canonicalState);
  typed.identity.solver.adapterVersion = "post-frozen-file-canonical-snapshot-v2";
  const canonicalState = JSON.stringify(typed);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalState));
  packet = {
    ...fixture.packet,
    canonicalState,
    stateHash: [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join(""),
  };
  vi.mocked(apiFetchResponse).mockImplementation(async () =>
    Response.json({
      schemaVersion: "standin.selection-preview.v1",
      previewOnly: true,
      bodyRevision: 3,
      packet,
    }),
  );
});
it("uses the shared canonical decoder and never requests confirmation or file preparation", async () => {
  const result = await loadSelectionPacket(
    "job_fixture",
    selection,
    candidate,
    "full",
    new AbortController().signal,
  );
  expect(result.body.children.length).toBeGreaterThan(0);
  expect(result.camera.baked).toBe("none");
  result.release();
  expect(apiFetchResponse).toHaveBeenCalledOnce();
  expect(vi.mocked(apiFetchResponse).mock.calls[0]).toEqual([
    "/v1/analysis/jobs/job_fixture/people/0/selection-preview",
    expect.objectContaining({
      method: "POST",
      body: { candidateId: candidate.id, bodyRevision: 3 },
    }),
  ]);
});
it("rejects a response from another body revision or a changed body hash", async () => {
  await expect(
    loadSelectionPacket(
      "job_fixture",
      { ...selection, selectionRevision: 4 },
      candidate,
      "full",
      new AbortController().signal,
    ),
  ).rejects.toThrow("body revision changed");
  await expect(
    loadSelectionPacket(
      "job_fixture",
      { ...selection, resolvedBody: { ...selection.resolvedBody!, assetSha256: "f".repeat(64) } },
      candidate,
      "full",
      new AbortController().signal,
    ),
  ).rejects.toThrow("selected model changed");
});
it("rejects corrupt canonical data and a response carrying the wrong candidate", async () => {
  packet = { ...packet, stateHash: "f".repeat(64) };
  await expect(
    loadSelectionPacket("job_fixture", selection, candidate, "full", new AbortController().signal),
  ).rejects.toThrow();
  packet = { ...fixture.packet };
  await expect(
    loadSelectionPacket(
      "job_fixture",
      selection,
      { ...candidate, id: "other" },
      "full",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
