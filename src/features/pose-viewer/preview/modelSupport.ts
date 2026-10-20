let available: boolean | undefined;

/** Check before requesting expensive model preparation or deferring the PNG. */
export function modelRenderingAvailable(): boolean {
  if (available !== undefined) return available;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    available = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    available = false;
  }
  return available;
}
