import { describe, it, expect } from "vitest";
import { validateImageFile } from "./validateImage";
import { MAX_FILE_BYTES } from "../constants";

// createImageBitmap 이전 단계(확장자·MIME·크기)의 거부만 검증한다.
// 이미지 디코딩 경로는 브라우저 환경 검증(수동/E2E)으로 다룬다.
describe("validateImageFile", () => {
  it("지원하지 않는 확장자를 거부", async () => {
    const file = new File(["x"], "notanimage.txt", { type: "text/plain" });
    const result = await validateImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
  });

  it("MIME이 이미지가 아니면 거부", async () => {
    const file = new File(["x"], "fake.png", { type: "application/pdf" });
    const result = await validateImageFile(file);
    expect(result.ok).toBe(false);
  });

  it("최대 크기를 초과하면 거부", async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1024);
    const file = new File([big], "big.png", { type: "image/png" });
    const result = await validateImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("큽니다");
  });
});
