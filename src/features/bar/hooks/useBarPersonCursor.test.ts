import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useBarPersonCursor } from "./useBarPersonCursor";
it("retains the current person across remounts but does not import another job's cursor", () => {
  const first = renderHook(() => useBarPersonCursor("current"));
  act(() => first.result.current[1](2));
  first.unmount();
  const second = renderHook(({ job }) => useBarPersonCursor(job), {
    initialProps: { job: "current" },
  });
  expect(second.result.current[0]).toBe(2);
  second.rerender({ job: "different" });
  expect(second.result.current[0]).toBe(0);
});
