import { expect, it } from "vitest";
import { readPosterCamera, posterCameraLabel } from "./posterCamera";

function headers(change: Record<string, string> = {}) {
  return new Headers({
    "X-Standin-Poster-Variant": "rough-yaw8-v1",
    "X-Standin-Poster-Yaw": "45",
    "X-Standin-Poster-Requested-Yaw": "30",
    "X-Standin-Poster-Fallback": "none",
    "X-Standin-Poster-Camera-Source": "fixed_117",
    "X-Standin-Projection-Matches-Search": "false",
    ...change,
  });
}
it("labels actual served angle and explicit front fallback without pretending pitch/perspective matches", () => {
  expect(posterCameraLabel(readPosterCamera(headers())!)).toBe("45° 방향 참고");
  const front = readPosterCamera(
    headers({ "X-Standin-Poster-Yaw": "0", "X-Standin-Poster-Fallback": "missing_angle" }),
  );
  expect(posterCameraLabel(front!)).toBe("정면 참고");
  expect(
    posterCameraLabel(
      readPosterCamera(headers({ "X-Standin-Poster-Camera-Source": "semantic_preview" }))!,
    ),
  ).toBe("기본 45° 방향 참고");
});
it("rejects stale angle, unknown version, forged exact match and an undeclared wrong front", () => {
  const changes: Record<string, string>[] = [
    { "X-Standin-Poster-Yaw": "90" },
    { "X-Standin-Poster-Variant": "unknown" },
    { "X-Standin-Projection-Matches-Search": "true" },
    { "X-Standin-Poster-Yaw": "0" },
    { "X-Standin-Poster-Requested-Yaw": "" },
  ];
  for (const change of changes) expect(() => readPosterCamera(headers(change))).toThrow();
});
