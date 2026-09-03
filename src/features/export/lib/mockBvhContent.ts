/**
 * 저장되는 placeholder 파일 내용. 실제 BVH 생성은 범위 밖(CLAUDE.md §2)이므로
 * 진짜 결과인 것처럼 보이지 않도록 명시적으로 표시한다(CLAUDE.md §10).
 *
 * 실제 저장 경로가 바이트를 다루므로 여기서도 바이트를 돌려준다 — Mock과 실서버 경로가
 * 타입에서 갈리면 한쪽만 동작하는 코드가 생긴다.
 */
export function mockBvhContent(candidateId: string): Uint8Array {
  const text = [
    "STANDIN MOCK POSE FILE — 실제 BVH 아님",
    "This is a placeholder file, not a real generated BVH.",
    `candidateId: ${candidateId}`,
    `generatedAt: ${new Date().toISOString()}`,
  ].join("\n");
  return new TextEncoder().encode(text);
}
