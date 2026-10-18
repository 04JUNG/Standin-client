/** 구형 성인 고정 FBX 6종과 청소년 2종은 제외한다. 아동은 유지한다. */
const retired = new Set([
  "body-female-athletic",
  "body-female-base",
  "body-female-muscular",
  "body-male-athletic",
  "body-male-base",
  "body-male-muscular",
  "body-teen-female",
  "body-teen-male",
]);

export function isRetiredCharacter(characterId: string): boolean {
  return retired.has(characterId);
}
