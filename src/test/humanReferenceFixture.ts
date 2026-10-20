import {
  DEFAULT_HUMAN_SHA,
  type HumanTemplate,
} from "@/features/pose-viewer/preview/humanReference/template";
export function humanFixture(): HumanTemplate {
  const data: [string, number, number[]][] = [
    ["hips", -1, [0, 0, 0]],
    ["spine", 0, [0, 1, 0]],
    ["spine1", 1, [0, 1.3, 0]],
    ["spine2", 2, [0, 1.6, 0]],
    ["neck", 3, [0, 1.8, 0]],
    ["head", 4, [0, 2, 0]],
    ["shoulder.L", 3, [0.2, 1.6, 0]],
    ["upperarm.L", 6, [0.5, 1.6, 0]],
    ["forearm.L", 7, [1, 1.6, 0]],
    ["hand.L", 8, [1.5, 1.6, 0]],
    ["shoulder.R", 3, [-0.2, 1.6, 0]],
    ["upperarm.R", 10, [-0.5, 1.6, 0]],
    ["forearm.R", 11, [-1, 1.6, 0]],
    ["hand.R", 12, [-1.5, 1.6, 0]],
    ["upleg.L", 0, [0.2, 0, 0]],
    ["leg.L", 14, [0.2, -0.8, 0]],
    ["foot.L", 15, [0.2, -1.6, 0]],
    ["toe.L", 16, [0.2, -1.6, 0.2]],
    ["upleg.R", 0, [-0.2, 0, 0]],
    ["leg.R", 18, [-0.2, -0.8, 0]],
    ["foot.R", 19, [-0.2, -1.6, 0]],
    ["toe.R", 20, [-0.2, -1.6, 0.2]],
  ];
  return {
    version: "default-body-template-v1",
    character_id: "standin-master-v2",
    character_sha256: DEFAULT_HUMAN_SHA,
    scope: "full",
    coordinates: "Y-up",
    preview_only: true,
    pose_method: "reference-skinning-v1",
    influences: 8,
    joints: data.map(([role, parent, head]) => ({
      role,
      parent,
      head,
      tail: [head[0], head[1] + 0.1, head[2]],
    })),
    profiles: { canonical: Object.fromEntries(data.map(([role]) => [role, role])) },
    meshes: [
      {
        positions: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        triangles: [0, 1, 2],
        skinIndices: Array(24).fill(0),
        skinWeights: Array.from({ length: 24 }, (_, i) => (i % 8 === 0 ? 1 : 0)),
      },
    ],
  };
}
export function bvhFixture(angle = 0, joined = false) {
  const t = humanFixture(),
    values: number[] = [];
  function bone(i: number): string {
    const j = t.joints[i],
      offset = j.head.map((n, k) => n - (j.parent < 0 ? 0 : t.joints[j.parent].head[k]));
    values.push(...(j.parent < 0 ? [0, 0, 0] : []), j.role === "upperarm.L" ? angle : 0, 0, 0);
    const children = t.joints.flatMap((x, n) => (x.parent === i ? [n] : []));
    return `${j.parent < 0 ? "ROOT" : "JOINT"} ${j.role}\n{\nOFFSET ${offset.join(" ")}\nCHANNELS ${j.parent < 0 ? "6 Xposition Yposition Zposition" : "3"} Zrotation Xrotation Yrotation\n${children.length ? children.map(bone).join("\n") : "End Site\n{\nOFFSET 0 .1 0\n}"}\n}`;
  }
  const hierarchy = bone(0);
  return `HIERARCHY\n${hierarchy}${joined ? "" : "\n"}MOTION\nFrames: 1\nFrame Time: 0.033333\n${values.join(" ")}\n`;
}
