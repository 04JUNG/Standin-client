/** 기본 파일명 규칙(docs/03 §8). 확장자는 저장 포맷이 정한다. */
import type { ExportFormat } from "../store/exportStore";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function defaultFileName(originalName?: string, format: ExportFormat = "fbx"): string {
  const ext = `.${format}`;
  if (originalName && originalName.trim()) {
    return `${stripExtension(originalName.trim())}_standin_pose${ext}`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `standin_pose_${stamp}${ext}`;
}

/**
 * 저장 직전에 확장자를 실제 포맷으로 맞춘다.
 *
 * 파일 이름은 설정에서 포맷을 바꾸기 전에 이미 정해져 있을 수 있고, 서버가 FBX를 노출하지
 * 않아 BVH로 내려가는 경우도 있다. 이름의 확장자와 내용이 어긋나면 클립스튜디오는 열지
 * 못하면서 이유는 알려 주지 않는다.
 */
export function withFormatExtension(fileName: string, format: ExportFormat): string {
  return `${stripExtension(fileName) || "standin_pose"}.${format}`;
}

/** 한 컷에 인물이 여럿이면 파일명에 인물 번호를 붙여 구분한다. 한 명뿐이면 base 그대로. */
export function personFileName(base: string, personIndex: number, totalSelected: number): string {
  if (totalSelected <= 1) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return `${stem}_인물${personIndex + 1}${ext}`;
}
