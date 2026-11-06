import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
/** Binary FBX parsing/decompression never runs on the screen's UI thread. */
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  postMessage: (message: unknown) => void;
};
worker.onmessage = (event) => {
  try {
    const loader = new FBXLoader();
    loader.manager.setURLModifier(() => {
      throw new Error("external resource");
    });
    const object = loader.parse(event.data, "");
    worker.postMessage({ ok: true, object: object.toJSON() });
  } catch {
    worker.postMessage({ ok: false });
  }
};
