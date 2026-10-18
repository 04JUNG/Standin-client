/** 남녀 쉐이프키 모델로 대체한 2026-10-10 성인 고정 FBX. 청소년·아동은 별도 체형이다. */
const retired = new Set([
  "body-female-athletic",
  "body-female-base",
  "body-female-muscular",
  "body-male-athletic",
  "body-male-base",
  "body-male-muscular",
]);

export function isRetiredCharacter(characterId: string): boolean {
  return retired.has(characterId);
}
