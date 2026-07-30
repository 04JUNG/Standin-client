import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 테스트마다 DOM을 비운다. 남겨두면 getByRole이 이전 테스트의 요소를 잡는다.
afterEach(() => {
  cleanup();
});
