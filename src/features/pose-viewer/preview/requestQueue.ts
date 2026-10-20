/** One shared transport slot for optional GLB and reference PNG work.
 * Queued requests are removed immediately on abort, before they can reach Blender.
 */
export class PreviewRequestQueue {
  private active = false;
  private waiting: Array<() => void> = [];

  async run<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", cancel);
        this.active = true;
        resolve();
      };
      const cancel = () => {
        const index = this.waiting.indexOf(start);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason);
      };
      if (!this.active) start();
      else {
        signal.addEventListener("abort", cancel, { once: true });
        this.waiting.push(start);
      }
    });
    try {
      signal.throwIfAborted();
      return await request();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active = false;
    }
  }
}
export const previewRequests = new PreviewRequestQueue();
