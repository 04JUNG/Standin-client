import { useQuery } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import type { BodyOption } from "../contract";
import { verifyDigest } from "../api";
import { bodyMock, bodyMockEnabled } from "../mock";
import { parseShapeRuntime, SHAPE_RUNTIME_FORMAT_V2, type AnyShapeRuntime } from "./format";
import { SUPPORTED_RULES } from "./evaluate";

export type ShapeRuntimeRef = NonNullable<BodyOption["shapeRuntime"]>;

/**
 * 이 앱이 계산할 수 있는 자산인가. 아니면 실시간 미리보기를 끄고 고정 그림을 쓴다.
 * v2(표본)는 규칙과 무관하게 계산할 수 있지만, 카탈로그가 어느 원본(source)으로 굽는지 밝혀야 한다.
 */
export const supportedRuntime = (ref?: ShapeRuntimeRef | null): ref is ShapeRuntimeRef =>
  !!ref && (ref.format === SHAPE_RUNTIME_FORMAT_V2 ? !!ref.source : SUPPORTED_RULES.has(ref.rules));

/**
 * 받은 자산이 카탈로그가 약속한 것과 같은가(버전 가드). 서버는 `source`의 컨트롤러로 FBX를 굽는다.
 * 미리보기가 다른 원본에서 나왔다면 저장될 몸과 다른 몸을 보여 주게 되므로 쓰지 않는다.
 */
export function matchesCatalog(runtime: AnyShapeRuntime, ref: ShapeRuntimeRef) {
  if (runtime.header.rules !== ref.rules || !(ref.preset in runtime.header.presets)) return false;
  if ((runtime.kind === "sampled") !== (ref.format === SHAPE_RUNTIME_FORMAT_V2)) return false;
  const source = runtime.header.source;
  // 카탈로그가 원본을 밝히지 않은 예전 체형(굽기 연동 전)은 규칙 이름만 맞으면 된다(v1만).
  if (!ref.source) return runtime.kind === "rules";
  // 굽기 연동 체형: 자산 머리말의 원본이 converter가 굽는 원본과 같아야 한다.
  // 원본 해시가 없는 예전 v1 자산은 확인할 수 없으니 쓰지 않는다.
  return (
    !!source &&
    ref.source.rules === runtime.header.rules &&
    ref.source.blendSha256 === source.blendSha256 &&
    ref.source.controllerSha256 === source.controllerSha256
  );
}

async function fetchRuntime(ref: ShapeRuntimeRef, signal?: AbortSignal): Promise<AnyShapeRuntime> {
  if (bodyMockEnabled()) return parseShapeRuntime(await bodyMock.shapeRuntime(ref.rules));
  const blob = await apiFetchBlob(ref.url, { auth: false, signal });
  if (blob.size !== ref.bytes) throw new Error("shape runtime size");
  const bytes = await blob.arrayBuffer();
  await verifyDigest(bytes, ref.sha256);
  const runtime = parseShapeRuntime(bytes);
  if (!matchesCatalog(runtime, ref)) throw new Error("shape runtime does not match catalog");
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
