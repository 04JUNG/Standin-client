export const POSTER_VARIANT = "rough-yaw8-v1";
export type PosterCamera = { yaw: number; source: string; fallback: string };

/** Verify the actual image's camera, including a declared same-source front fallback. */
export function readPosterCamera(headers: Headers): PosterCamera | undefined {
  if (!headers.has("X-Standin-Poster-Variant")) return undefined;
  const yaw = headers.get("X-Standin-Poster-Yaw");
  const fallback = headers.get("X-Standin-Poster-Fallback") ?? "";
  const source = headers.get("X-Standin-Poster-Camera-Source") ?? "";
  const requested = headers.get("X-Standin-Poster-Requested-Yaw");
  const n =
    requested === "none"
      ? null
      : requested === null || requested.trim() === ""
        ? NaN
        : Number(requested);
  const expected = n === null ? 0 : (Math.floor(((((n % 360) + 360) % 360) + 22.5) / 45) % 8) * 45;
  if (
    headers.get("X-Standin-Poster-Variant") !== POSTER_VARIANT ||
    !["0", "45", "90", "135", "180", "225", "270", "315"].includes(yaw ?? "") ||
    ![
      "none",
      "missing_angle",
      "missing_directional_asset",
      "unsupported_scope",
      "camera_unavailable",
    ].includes(fallback) ||
    !["fixed_117", "semantic_preview", "unavailable"].includes(source) ||
    (n !== null && !Number.isFinite(n)) ||
    (source === "unavailable" ? n !== null || fallback !== "camera_unavailable" : n === null) ||
    (fallback === "none" ? Number(yaw) !== expected : yaw !== "0") ||
    headers.get("X-Standin-Projection-Matches-Search") !== "false"
  )
    throw Error("포즈 이미지 방향을 확인하지 못했습니다.");
  return { yaw: Number(yaw), source, fallback };
}

export function posterCameraLabel(camera: PosterCamera): string {
  if (camera.fallback !== "none") return "정면 참고";
  return `${camera.source === "semantic_preview" ? "기본 " : ""}${camera.yaw}° 방향 참고`;
}
