import type { ReviewItem } from "@/features/pose-viewer/hooks/useSelectionReview";
import { validRotation } from "@/features/pose-viewer/preview/modelContract";
export const LOCAL_CAMERA_VERSION = "personal-camera/1";
export type LocalCamera = {
  version: typeof LOCAL_CAMERA_VERSION;
  sourceBvhSha256: string | null;
  rotation: number[][] | null;
};
/** BVH remains in source space. Apply this model rotation once in the local exporter. */
export function personalCamera(item: ReviewItem): LocalCamera {
  const preview = item.candidate.previewModel;
  const source = item.candidate.sourceBvhSha256;
  const camera: LocalCamera = {
    version: LOCAL_CAMERA_VERSION,
    sourceBvhSha256: source ?? null,
    rotation: null,
  };
  const presentation = item.candidate.presentationCamera;
  if (presentation) {
    if (
      !["candidate-camera-v1", "candidate-camera-v2"].includes(presentation.version ?? "") ||
      !validRotation(presentation.rotation) ||
      !/^[a-f0-9]{64}$/.test(presentation.sourceBvhSha256 ?? "") ||
      (source && source !== presentation.sourceBvhSha256)
    )
      throw { code: "CAMERA_UNSUPPORTED" };
    camera.sourceBvhSha256 = presentation.sourceBvhSha256!;
    camera.rotation = presentation.rotation.map((row) => [...row]);
  }
  if (preview) {
    if (
      !validRotation(preview.rotation) ||
      !/^[a-f0-9]{64}$/.test(preview.sourceSha) ||
      (source && source !== preview.sourceSha) ||
      (presentation &&
        (preview.sourceSha !== camera.sourceBvhSha256 ||
          JSON.stringify(preview.rotation) !== JSON.stringify(camera.rotation)))
    )
      throw { code: "CAMERA_UNSUPPORTED" };
    camera.sourceBvhSha256 = preview.sourceSha;
    camera.rotation = preview.rotation.map((row) => [...row]);
  }
  if (camera.sourceBvhSha256 !== null && !/^[a-f0-9]{64}$/.test(camera.sourceBvhSha256))
    throw { code: "CAMERA_UNSUPPORTED" };
  return camera;
}
