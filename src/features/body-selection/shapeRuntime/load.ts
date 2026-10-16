import { useQuery } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import type { BodyOption } from "../contract";
import { verifyDigest } from "../api";
import { bodyMock, bodyMockEnabled } from "../mock";
import { parseShapeRuntime, type ShapeRuntime } from "./format";
import { SUPPORTED_RULES } from "./evaluate";

export type ShapeRuntimeRef = NonNullable<BodyOption["shapeRuntime"]>;

/** 이 앱이 계산할 수 있는 규칙의 자산인가. 아니면 실시간 미리보기를 끄고 고정 그림을 쓴다. */
export const supportedRuntime = (ref?: ShapeRuntimeRef | null): ref is ShapeRuntimeRef =>
  !!ref && SUPPORTED_RULES.has(ref.rules);

async function fetchRuntime(ref: ShapeRuntimeRef, signal?: AbortSignal): Promise<ShapeRuntime> {
  if (bodyMockEnabled()) return parseShapeRuntime(await bodyMock.shapeRuntime(ref.rules));
  const blob = await apiFetchBlob(ref.url, { auth: false, signal });
  if (blob.size !== ref.bytes) throw new Error("shape runtime size");
  const bytes = await blob.arrayBuffer();
  await verifyDigest(bytes, ref.sha256);
  const runtime = parseShapeRuntime(bytes);
  if (runtime.header.rules !== ref.rules || !(ref.preset in runtime.header.presets))
    throw new Error("shape runtime does not match catalog");
  return runtime;
}

/**
 * 체형 더보기를 처음 열 때 한 번 받는다. 같은 sha256이면 다시 받지 않는다(모든 프리셋이 같은
 * 자산을 쓴다). 실패하면 다시 시도하지 않고 고정 그림으로 떨어진다.
 */
export function useShapeRuntime(ref?: ShapeRuntimeRef | null) {
  const enabled = supportedRuntime(ref);
  return useQuery({
    queryKey: ["body", "shape-runtime", enabled ? ref.sha256 : null],
    enabled,
    queryFn: ({ signal }) => fetchRuntime(ref!, signal),
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}
