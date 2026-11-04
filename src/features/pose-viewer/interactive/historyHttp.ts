import { apiFetch } from "@/shared/api/client";
import { operationPath, type Target, type Operation } from "./http";
import { hex } from "./assets";
import type { HistoryUpload } from "./history";
/** Actual BFF auxiliary ClientFrame route. Server-authoritative history remains independently archived. */
export function historyUpload(target: Target, operation: Operation): HistoryUpload {
  return async (frame, signal) => {
    if (
      frame.png.type !== "image/png" ||
      frame.png.size > 1024 * 1024 ||
      frame.revision !== operation.revision ||
      frame.stateHash !== operation.stateHash
    )
      throw Error("frame binding changed");
    const bytes = new Uint8Array(await frame.png.arrayBuffer());
    signal.throwIfAborted();
    let binary = "";
    for (let start = 0; start < bytes.length; start += 8192)
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    const cameraHash = hex(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify({ camera: frame.camera, observation: frame.observation }),
        ),
      ),
    );
    signal.throwIfAborted();
    await apiFetch(`${operationPath(target, operation.operationId)}/client-frame`, {
      method: "POST",
      auth: false,
      cache: "no-store",
      signal,
      body: {
        schemaVersion: "standin.interactive-http.v1",
        revision: frame.revision,
        stateHash: frame.stateHash,
        cameraHash,
        rendererVersion: frame.renderer,
        imageSha256: frame.sha256,
        pngBase64: btoa(binary),
        source: "client-canvas-ui-auxiliary",
      },
    });
  };
}
