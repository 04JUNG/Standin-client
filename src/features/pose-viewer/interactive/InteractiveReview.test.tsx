import { StrictMode } from "react";
import { render, act, waitFor } from "@testing-library/react";
import { Group } from "three";
import { expect, it, vi } from "vitest";
import { InteractiveReview } from "./InteractiveReview";
import type { ModelResult } from "./http";
import { prepareSurface } from "./solved";
import { loadSkinSurface, skinPreviewSchema } from "../skin/skinPreview";
import { previewFixture } from "../skin/__fixtures__/skinPreview";
vi.mock("../skin/skinPreview", async (original) => ({
  ...(await original<typeof import("../skin/skinPreview")>()),
  loadSkinSurface: vi.fn(),
}));
vi.mock("./InteractivePose", () => ({ ExpandablePose: () => <div>포즈</div> }));
vi.mock("./solved", () => ({
  prepareSurface: vi.fn(() => ({ body: {}, release: vi.fn() })),
  solvedCamera: vi.fn(() => ({})),
}));
it("releases every prepared surface across StrictMode, notice updates and unmount", () => {
  const model = {
    frame: {},
    state: { model: {}, identity: { selection: { candidate: "fixture" } } },
  } as ModelResult;
  const data = { model, viewKey: "fixture", notice: "파일 준비 중", failed: false };
  const view = render(
    <StrictMode>
      <InteractiveReview data={data} />
    </StrictMode>,
  );
  const count = vi.mocked(prepareSurface).mock.calls.length;
  view.rerender(
    <StrictMode>
      <InteractiveReview data={{ ...data, notice: "" }} />
    </StrictMode>,
  );
  expect(prepareSurface).toHaveBeenCalledTimes(count);
  view.unmount();
  for (const result of vi.mocked(prepareSurface).mock.results)
    expect(result.value.release).toHaveBeenCalledOnce();
});
it("reuses verified skin assets across equivalent operation polls/notice updates and releases on unmount", async () => {
  vi.mocked(loadSkinSurface).mockImplementation(async () => ({
    body: new Group(),
    release: vi.fn(),
  }));
  const preview = skinPreviewSchema.parse(previewFixture());
  const model = {
    frame: {},
    packet: { stateHash: "a".repeat(64), revision: 1 },
    state: {
      model: {},
      identity: {
        selection: { candidate: "fixture" },
        scope: "full",
        body: {
          characterId: preview.compatibility.characterId,
          characterSha256: preview.compatibility.characterSha256,
        },
      },
    },
  } as ModelResult;
  const data = {
    model,
    skin: preview.skin,
    skinPreview: preview,
    skinState: { stateHash: "a".repeat(64), revision: 1 },
    viewKey: "skin-fixture",
    notice: "파일 준비 중",
    failed: false,
  };
  const view = render(
    <StrictMode>
      <InteractiveReview data={data} />
    </StrictMode>,
  );
  await waitFor(() => expect(loadSkinSurface).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  const count = vi.mocked(loadSkinSurface).mock.calls.length;
  view.rerender(
    <StrictMode>
      <InteractiveReview
        data={{
          ...data,
          skin: { ...data.skin },
          skinPreview: structuredClone(preview),
          skinState: { ...data.skinState },
          notice: "",
        }}
      />
    </StrictMode>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(loadSkinSurface).toHaveBeenCalledTimes(count);
  view.unmount();
  for (const result of vi.mocked(loadSkinSurface).mock.results)
    expect((await result.value).release).toHaveBeenCalledOnce();
});
