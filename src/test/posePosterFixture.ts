export const POSTER_SOURCE = "a".repeat(64);
export const POSTER_URL =
  "/v1/pose-candidates/pose/poster?jobId=job&personIndex=0&candidateId=pose";
export async function posterResponse(change: Record<string, string> = {}, scope = "full") {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "X-Standin-Poster-Kind": "default-body",
      "X-Standin-Poster-Version": "default-body-poster-v1",
      "X-Standin-Source-BVH-SHA256": POSTER_SOURCE,
      "X-Standin-Output-Scope": scope,
      "X-Standin-Preview-Only": "true",
      "X-Standin-Preview-Projection": "orthographic",
      "X-Standin-Character-Id": "standin-master-v2",
      "X-Standin-Character-SHA256": "b".repeat(64),
      "X-Standin-Preview-Revision": "c".repeat(64),
      "X-Standin-Artifact-SHA256": digest,
      ...change,
    },
  });
}
