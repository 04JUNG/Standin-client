import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetApiClient, setInstallationCredentials } from "@/shared/api/client";
import { HandThumbnail } from "./HandThumbnail";
import { handThumbnailKeys, loadHandThumbnail } from "./thumbnail";
import type { HandPreset } from "./contract";

const library = "a".repeat(64);
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4b0AAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const preset: HandPreset = {
  id: "fist",
  label: "주먹",
  description: "주먹",
  thumbnails: {
    left: "/v1/hands/fist/thumbnail?side=left",
    right: "/v1/hands/fist/thumbnail?side=right",
  },
};
const image = () =>
  new Response(png, {
    headers: { "Content-Type": "image/png", "X-Standin-Hand-Library-SHA256": library },
  });
beforeEach(() => {
  __resetApiClient();
  setInstallationCredentials({ installationId: "owner", deviceToken: "device" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetApiClient();
});

it("uses installation auth and the requested character side/library for actual PNG bytes", async () => {
  const fetcher = vi.fn().mockImplementation(async () => image());
  vi.stubGlobal("fetch", fetcher);
  const result = await loadHandThumbnail("fist", "left", library, new AbortController().signal);
  expect(result).toMatch(/^data:image\/png;base64,/);
  expect(fetcher.mock.calls[0]![0]).toContain(
    `/v1/hands/fist/thumbnail?side=left&library=${library}`,
  );
  const request = fetcher.mock.calls[0]![1];
  expect(request.headers["X-Device-Token"]).toBe("device");
  expect(request.headers.Authorization).toBeUndefined();
  expect(request.cache).toBe("no-cache");
  expect(handThumbnailKeys.image("owner", library, "fist", "left")).not.toEqual(
    handThumbnailKeys.image("owner", library, "fist", "right"),
  );
  expect(handThumbnailKeys.image("other", library, "fist", "left")).not.toEqual(
    handThumbnailKeys.image("owner", library, "fist", "left"),
  );
});
it("rejects wrong library, HTML responses and invalid PNGs rather than returning an empty image", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(
    new Response(png, {
      headers: { "Content-Type": "image/png", "X-Standin-Hand-Library-SHA256": "b".repeat(64) },
    }),
  );
  await expect(
    loadHandThumbnail("fist", "left", library, new AbortController().signal),
  ).rejects.toThrow();
  fetcher.mockResolvedValueOnce(
    new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }),
  );
  await expect(
    loadHandThumbnail("fist", "left", library, new AbortController().signal),
  ).rejects.toThrow();
  fetcher.mockResolvedValueOnce(
    new Response("not png", { headers: { "Content-Type": "image/png" } }),
  );
  await expect(
    loadHandThumbnail("fist", "left", library, new AbortController().signal),
  ).rejects.toThrow();
});
it("cancellation is preserved and invalid ids never reach the network", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(loadHandThumbnail("fist", "left", library, controller.signal)).rejects.toThrow();
  await expect(
    loadHandThumbnail("../fist", "left", library, new AbortController().signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("renders the real hand image at card size, with no CSS mirroring", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => image()),
  );
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <HandThumbnail preset={preset} side="right" librarySha={library} large />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  const thumb = container.querySelector("img")!;
  expect(thumb).toHaveAttribute("data-hand-side", "right");
  expect(thumb.className).toContain("h-24");
  expect(thumb.style.transform).toBe("");
});
it("shows a failure and a refetch recovers the PNG", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockImplementation(async () => image());
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient();
  const { container } = render(
    <QueryClientProvider client={client}>
      <HandThumbnail preset={preset} side="left" librarySha={library} />
      <button onClick={() => void client.refetchQueries({ queryKey: ["hands"], type: "active" })}>
        다시 시도
      </button>
    </QueryClientProvider>,
  );
  await screen.findByRole("img", { name: "손 이미지 없음" });
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
});
it("does not fake a hand preview if the catalog has no image", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HandThumbnail preset={{ ...preset, thumbnails: null }} side="left" librarySha={library} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("img", { name: "손 이미지 없음" })).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
