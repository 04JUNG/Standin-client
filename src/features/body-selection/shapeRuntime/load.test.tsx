import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import fixture from "./__fixtures__/mini-sampled.json";
import { parseShapeRuntime, type SampledRuntime } from "./format";
import { useShapeRuntime, type ShapeRuntimeRef } from "./load";

const fetchBlob = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()), apiFetchBlob: fetchBlob,
}));
let bytes: ArrayBuffer;
let runtime: SampledRuntime;
let ref: ShapeRuntimeRef;
beforeAll(async () => {
  const raw = Uint8Array.from(atob(fixture.ssrGzip), (c) => c.charCodeAt(0));
  bytes = await new Response(new Response(raw).body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  runtime = parseShapeRuntime(bytes) as SampledRuntime;
  ref = { url: "/runtime", bytes: bytes.byteLength, sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    format: "standin-shape-runtime.v2", rules: runtime.header.rules,
    preset: Object.keys(runtime.header.presets)[0]!,
    source: { rules: runtime.header.rules, ...runtime.header.source } };
});
beforeEach(() => {
  fetchBlob.mockReset();
  fetchBlob.mockResolvedValue({ size: bytes.byteLength, arrayBuffer: async () => bytes });
  vi.stubGlobal("crypto", webcrypto);
});
function setup(seed = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) client.setQueryData(["body", "shape-runtime", ref.sha256, ref.bytes], runtime);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

it.each(["source", "rules", "preset", "format"])("rejects a cached asset when current catalog %s differs", async (field) => {
  const { wrapper } = setup();
  const bad = { ...ref };
  if (field === "source") bad.source = { ...ref.source!, controllerSha256: "d".repeat(64) };
  if (field === "rules") bad.rules = "another-controller";
  if (field === "preset") bad.preset = "MISSING";
  if (field === "format") { bad.format = "standin-shape-runtime.v1"; bad.rules = "standin-body-0.7.2"; }
  const h = renderHook(() => useShapeRuntime(bad), { wrapper });
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.data).toBeUndefined();
  expect(fetchBlob).not.toHaveBeenCalled();
});

it("rechecks a mounted observer, hides its previous mesh on rejection, and recovers without downloading", async () => {
  const { wrapper } = setup();
  const h = renderHook(({ current }) => useShapeRuntime(current), { wrapper, initialProps: { current: ref } });
  expect(h.result.current.data).toBe(runtime);
  h.rerender({ current: { ...ref, source: { ...ref.source!, blendSha256: "e".repeat(64) } } });
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.data).toBeUndefined();
  // The failed observer must not poison another consumer of the same immutable bytes.
  const other = renderHook(() => useShapeRuntime(ref), { wrapper });
  expect(other.result.current.data).toBe(runtime);
  h.rerender({ current: ref });
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  expect(h.result.current.data).toBe(runtime);
  expect(fetchBlob).not.toHaveBeenCalled();
});

it("downloads and verifies once, sharing the bytes across valid presets", async () => {
  const { wrapper } = setup(false);
  const h = renderHook(({ current }) => useShapeRuntime(current), { wrapper, initialProps: { current: ref } });
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  h.rerender({ current: { ...ref, preset: Object.keys(runtime.header.presets)[1]! } });
  expect(h.result.current.data?.kind).toBe("sampled");
  expect(fetchBlob).toHaveBeenCalledTimes(1);
});

it("does not reuse a cache entry to bypass a changed expected byte count", async () => {
  const { wrapper } = setup();
  const h = renderHook(() => useShapeRuntime({ ...ref, bytes: ref.bytes + 1 }), { wrapper });
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.data).toBeUndefined();
  expect(fetchBlob).toHaveBeenCalledTimes(1);
});
