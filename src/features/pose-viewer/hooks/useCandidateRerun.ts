import type { AnalysisResult, PersonResult } from "../api/pose.contract";

/**
 * "후보 다시 찾기" 자리. 서버가 같은 인물의 다음 후보 묶음을 주게 되면
 * (`capabilities.candidateRerun`) 이 훅이 동작을 돌려준다.
 *
 * 지금은 어떤 BFF도 그 기능을 노출하지 않으므로 항상 null이고, 화면은 자리를 그리지
 * 않는다 — 누르면 "지원하지 않는다"만 나오는 버튼을 두지 않는다(CLAUDE.md §10).
 */
export function useCandidateRerun(
  result: AnalysisResult | undefined,
  person: PersonResult | undefined,
): (() => void) | null {
  // 서버 계약이 생기면 여기서 이 인물(person.index)의 다음 묶음을 요청하는 동작을 만든다.
  if (result?.capabilities.candidateRerun !== true || !person) return null;
  return null;
}
