import { gunzipSync, strFromU8 } from "fflate";
import { referenceDigest, boundedReferenceBytes } from "../../api/humanReference";
import { parseHumanTemplate, humanScopes, type HumanScope, type HumanTemplate } from "./template";
import type { FingerSkin } from "./sourceFingers";
import type { Correctives } from "./correctives";
import manifest from "./approvedAssets/manifest.json";
import female from "./approvedAssets/female.json.gz?url";
import male from "./approvedAssets/male.json.gz?url";

export type PreviewGender = "female" | "male";
export type ApprovedModel = { template: HumanTemplate; skin: FingerSkin; corrections: Correctives };
const urls = { female, male };
const models = new Map<PreviewGender, Promise<ApprovedModel>>();
const scopes = new WeakMap<HumanTemplate, Map<HumanScope, HumanTemplate>>();

// Static, app-bundled data: fetched and parsed once per gender, never sent to Blender.
async function readModel(gender: PreviewGender): Promise<ApprovedModel> {
  const expected = manifest[gender];
  const response = await fetch(urls[gender]);
  if (!response.ok) throw Error("미리보기 모델을 불러오지 못했습니다.");
  const packed = await boundedReferenceBytes(response, expected.gzipBytes);
  if (
    packed.length !== expected.gzipBytes ||
    (await referenceDigest(packed)) !== expected.gzipSha256
  )
    throw Error("미리보기 모델 파일이 변경되었습니다.");
  const raw = gunzipSync(packed);
  if (raw.length !== expected.jsonBytes || (await referenceDigest(raw)) !== expected.jsonSha256)
    throw Error("미리보기 모델을 확인하지 못했습니다.");
  // Both hashes above pin the complete finger payload as well as the body mesh.
  const decoded = JSON.parse(strFromU8(raw)) as ApprovedModel;
  const template = parseHumanTemplate(decoded.template, "full", expected);
  if (decoded.skin.joints.length !== 30 || decoded.skin.weights.length !== template.meshes.length)
    throw Error("손가락 모델을 확인하지 못했습니다.");
  if (
    decoded.corrections.restRotations.length !== template.joints.length ||
    !decoded.corrections.shapes.length
  )
    throw Error("관절 보정 데이터를 확인하지 못했습니다.");
  return { template, skin: decoded.skin, corrections: decoded.corrections };
}

function scopedTemplate(template: HumanTemplate, scope: HumanScope) {
  if (scope === "full") return template;
  if (!scopes.has(template)) scopes.set(template, new Map());
  const cache = scopes.get(template)!;
  if (!cache.has(scope)) {
    const y = (role: string) => template.joints.find((j) => j.role === role)!.head[1];
    const cut = {
      half: y("hips") - 0.06,
      bust: y("spine1"),
      shoulder_head: y("shoulder.L") - 0.08,
      head: y("neck"),
    }[scope];
    cache.set(scope, {
      ...template,
      scope,
      meshes: template.meshes.map((mesh) => {
        const triangles: number[] = [];
        for (let i = 0; i < mesh.triangles.length; i += 3) {
          const face = mesh.triangles.slice(i, i + 3);
          if (face.every((v) => mesh.positions[v * 3 + 1] >= cut)) triangles.push(...face);
        }
        return { ...mesh, triangles };
      }),
    });
  }
  return cache.get(scope)!;
}

export async function loadApprovedModel(gender: PreviewGender, scope: string, signal: AbortSignal) {
  if (!humanScopes.includes(scope as HumanScope)) throw Error("지원하지 않는 미리보기 범위입니다.");
  if (!models.has(gender))
    models.set(
      gender,
      readModel(gender).catch((error) => {
        models.delete(gender);
        throw error;
      }),
    );
  const model = await models.get(gender)!;
  signal.throwIfAborted();
  return { ...model, template: scopedTemplate(model.template, scope as HumanScope) };
}
