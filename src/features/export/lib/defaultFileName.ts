/** 기본 파일명 규칙(docs/03 §8). 확장자는 항상 .bvh로 강제한다. */
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function defaultFileName(originalName?: string): string {
  if (originalName && originalName.trim()) {
    return `${stripExtension(originalName.trim())}_standin_pose.bvh`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `standin_pose_${stamp}.bvh`;
}

/** 한 컷에 인물이 여럿이면 파일명에 인물 번호를 붙여 구분한다. 한 명뿐이면 base 그대로. */
export function personFileName(base: string, personIndex: number, totalSelected: number): string {
  if (totalSelected <= 1) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return `${stem}_인물${personIndex + 1}${ext}`;
}
