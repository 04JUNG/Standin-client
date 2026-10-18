import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { BODY_PREVIEWS } from "@/features/models/lib/previewImages";
import { LiveBodyView, NeutralImage, ShapeThumb } from "./LiveBodyView";
import type { BodyOption } from "./contract";

const option = (shape: boolean): BodyOption => ({
  characterId: "male-base",
  bodyRef: {
    bodyId: "male-base",
    characterId: "male-base",
    bodyVersion: "1",
    assetSha256: "a".repeat(64),
    rigVersion: "1",
    measurementVersion: "1",
  },
  selectable: true,
  reasonCodes: [],
  ...(shape
    ? {
        shape: {
          schemaVersion: "body-shape.v1",
          controls: [{ key: "height", min: 150, max: 195, step: 1, default: 178 }],
        },
      }
    : {}),
});

const runtimeRef = (rules: string) => ({
  url: "/v1/body-assets/shape-runtime",
  sha256: "b".repeat(64),
  bytes: 1000,
  format: "standin-shape-runtime.v1" as const,
  rules,
  preset: "BASE",
});

describe("NeutralImage", () => {
  it.each(Object.entries(BODY_PREVIEWS))(
    "shows the reviewed still for %s without a neutral-preview URL",
    (characterId, asset) => {
      const client = new QueryClient();
      const { container } = render(
        createElement(QueryClientProvider, { client }, createElement(NeutralImage, {
          option: {
            characterId,
            bodyRef: { ...option(false).bodyRef, characterId, assetSha256: asset.assetSha256 },
          },
        })),
      );
      expect(container.querySelector("img")).toHaveAttribute("src", asset.image);
      expect(screen.queryByText("미리보기 없음")).toBeNull();
    },
  );

  it("drops the still when the catalog changes to a different FBX revision", () => {
    const client = new QueryClient();
    const asset = BODY_PREVIEWS["body-child"]!;
    const look = {
      characterId: "body-child",
      bodyRef: { ...option(false).bodyRef, characterId: "body-child", assetSha256: asset.assetSha256 },
    };
    const content = (assetSha256: string) => createElement(QueryClientProvider, { client },
      createElement(NeutralImage, { option: { ...look, bodyRef: { ...look.bodyRef, assetSha256 } } }),
    );
    const { container, rerender } = render(content(asset.assetSha256));
    expect(container.querySelector("img")).toBeTruthy();
    rerender(content("0".repeat(64)));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("미리보기 없음")).toBeTruthy();
  });
});

function view(props: Partial<Parameters<typeof LiveBodyView>[0]>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(LiveBodyView, {
        option: option(true),
        name: "기본",
        controls: { height: 185 },
        edited: true,
        personIndex: 0,
        variant: "app",
        ...props,
      }),
    ),
  );
}

describe("LiveBodyView", () => {
  // 실서버 모드에는 실시간 렌더러가 아직 없다. 바뀐 수치를 그린 것처럼 보이면 안 된다.
  it("says the numeric preview is unavailable instead of faking it", () => {
    view({});
    expect(screen.getByText("기본 수정")).toBeTruthy();
    expect(screen.getByText(/수치 미리보기를 쓸 수 없어요/)).toBeTruthy();
  });

  it("ignores a runtime built for other rules", () => {
    view({ option: { ...option(true), shapeRuntime: runtimeRef("standin-body-9.9.9") } });
    expect(screen.queryByText("3D 체형 불러오는 중")).toBeNull();
    expect(screen.getByText(/수치 미리보기를 쓸 수 없어요/)).toBeTruthy();
  });

  it("shows loading while the 0.6.7 runtime downloads", () => {
    view({ option: { ...option(true), shapeRuntime: runtimeRef("standin-body-0.6.7") } });
    expect(screen.getByText("3D 체형 불러오는 중")).toBeTruthy();
  });

  it("labels a fixed body without slider hints", () => {
    view({ option: option(false), controls: null, edited: false });
    expect(screen.getByText("고정 체형")).toBeTruthy();
    expect(screen.queryByText("수정 중")).toBeNull();
  });
});

it("hides a cached shape thumbnail when its runtime no longer matches the catalog", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref = { ...runtimeRef("standin-body-0.7.2"), source: {
    rules: "standin-body-0.7.2", blendSha256: "c".repeat(64), controllerSha256: "d".repeat(64),
  } };
  client.setQueryData(["body", "shape-runtime", ref.sha256, ref.bytes], {
    kind: "rules", header: { rules: ref.rules, presets: { BASE: {} }, source: {
      blendSha256: "c".repeat(64), controllerSha256: "e".repeat(64),
    } },
  });
  const controls = { height: 185 };
  client.setQueryData(["body", "shape-thumb", ref.sha256, ref.preset, controls], "data:image/png;base64,OLD");
  render(createElement(QueryClientProvider, { client }, createElement(ShapeThumb, {
    look: { ...option(true), shapeRuntime: ref }, controls,
  })));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("미리보기 없음")).toBeTruthy();
});
