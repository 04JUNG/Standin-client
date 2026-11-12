import * as THREE from "three";
import { useEffect, useState } from "react";
import type { SkinId } from "../../skin/skinChoices";
import { skinMaterial } from "../../skin/skinSurface";
import { boundedReferenceBytes, referenceDigest } from "../../api/humanReference";
import type { PreviewGender } from "./approvedModels";
import type { SurfaceView } from "../../interactive/InteractivePose";
import pins from "./approvedAssets/skinTextures.json";
import maleFlesh from "./approvedAssets/male-flesh.png";
import maleGuide from "./approvedAssets/male-gray-guide.png";
import maleFleshGuide from "./approvedAssets/male-flesh-guide.png";
import maleMuscle from "./approvedAssets/male-muscle.png";
import femaleFlesh from "./approvedAssets/female-flesh.png";
import femaleGuide from "./approvedAssets/female-gray-guide.png";
import femaleFleshGuide from "./approvedAssets/female-flesh-guide.png";
import femaleMuscle from "./approvedAssets/female-muscle.png";
import maleFleshMuscle from "./approvedAssets/male-flesh-muscle.png";
import femaleFleshMuscle from "./approvedAssets/female-flesh-muscle.png";
const urls = {
  male: {
    flesh: maleFlesh,
    "gray-guide": maleGuide,
    "flesh-guide": maleFleshGuide,
    muscle: maleMuscle,
    "flesh-muscle": maleFleshMuscle,
  },
  female: {
    flesh: femaleFlesh,
    "gray-guide": femaleGuide,
    "flesh-guide": femaleFleshGuide,
    muscle: femaleMuscle,
    "flesh-muscle": femaleFleshMuscle,
  },
};
type LineSkin = Exclude<SkinId, "default">;
// Ten immutable bundled textures at most; no per-pose downloads or painted geometry.
const textures = new Map<string, Promise<THREE.Texture>>();
export function loadReferenceSkin(gender: PreviewGender, skin: LineSkin) {
  const key = `${gender}:${skin}`;
  if (!textures.has(key))
    textures.set(
      key,
      (async () => {
        const expected = pins[gender][skin];
        const response = await fetch(urls[gender][skin]);
        if (!response.ok) throw Error("스킨을 불러오지 못했어요.");
        const bytes = await boundedReferenceBytes(response, expected.bytes);
        if (bytes.length !== expected.bytes || (await referenceDigest(bytes)) !== expected.sha256)
          throw Error("스킨 파일이 변경되었습니다.");
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]), {
          imageOrientation: "flipY",
          colorSpaceConversion: "none",
        });
        if (bitmap.width !== 2048 || bitmap.height !== 2048) {
          bitmap.close();
          throw Error("스킨 크기가 변경되었습니다.");
        }
        const texture = new THREE.Texture(bitmap);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        return texture;
      })().catch((error) => {
        textures.delete(key);
        throw error;
      }),
    );
  return textures.get(key)!;
}
export function referenceSkinSurface(source: THREE.Group, texture: THREE.Texture, skin: LineSkin) {
  const body = source.clone(true);
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  body.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const uv = object.geometry.userData.previewCornerUv as number[] | undefined;
    if (!uv || !object.geometry.index || uv.length !== object.geometry.index.count * 2)
      throw Error("스킨 좌표가 없습니다.");
    object.geometry = object.geometry.toNonIndexed();
    object.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometries.push(object.geometry);
    const material = skinMaterial(texture, skin);
    materials.push(material);
    object.material = material;
  });
  return {
    body,
    release() {
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}
export function useReferenceSkin(
  source: SurfaceView | undefined,
  gender: PreviewGender,
  skin: SkinId,
) {
  const [loaded, setLoaded] = useState<{
    source: SurfaceView;
    skin: SkinId;
    gender: PreviewGender;
    surface: SurfaceView;
  }>();
  const [failure, setFailure] = useState<{
    source: SurfaceView;
    skin: SkinId;
    gender: PreviewGender;
  }>();
  useEffect(() => {
    if (!source || skin === "default") return;
    let cancelled = false;
    let display: ReturnType<typeof referenceSkinSurface> | undefined;
    void loadReferenceSkin(gender, skin)
      .then((texture) => {
        if (cancelled) return;
        display = referenceSkinSurface(source.body, texture, skin);
        setLoaded({ source, gender, skin, surface: { ...source, body: display.body } });
      })
      .catch(() => {
        if (!cancelled) setFailure({ source, gender, skin });
      });
    return () => {
      cancelled = true;
      display?.release();
    };
  }, [source, gender, skin]);
  const matches = (entry: typeof loaded | typeof failure) =>
    entry?.source === source && entry?.skin === skin && entry?.gender === gender;
  return {
    surface: skin === "default" ? source : matches(loaded) ? loaded?.surface : undefined,
    failed: matches(failure),
  };
}
