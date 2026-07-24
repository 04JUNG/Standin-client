/**
 * 저장되는 .bvh의 placeholder 내용. 실제 BVH 생성은 범위 밖(CLAUDE.md §2)이므로
 * 진짜 결과인 것처럼 보이지 않도록 명시적으로 표시한다(CLAUDE.md §10).
 */
export function mockBvhContent(candidateId: string): string {
  return [
    "STANDIN MOCK POSE FILE — 실제 BVH 아님",
    "This is a placeholder file, not a real generated BVH.",
    `candidateId: ${candidateId}`,
    `generatedAt: ${new Date().toISOString()}`,
  ].join("\n");
}
