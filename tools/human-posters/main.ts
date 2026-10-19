import {
  parseHumanTemplate,
  type HumanScope,
} from "../../src/features/pose-viewer/preview/humanReference/template";
import { renderHumanReference } from "../../src/features/pose-viewer/preview/humanReference/render";
const status = document.querySelector<HTMLPreElement>("#status")!;
const button = document.querySelector<HTMLButtonElement>("#start")!;
button.onclick = async () => {
  button.disabled = true;
  const started = performance.now();
  let written = 0;
  const failures: { source: string; scope: string; error: string }[] = [];
  try {
    const work = await (await fetch("/__human-bake/work")).json();
    const templates = new Map();
    for (const scope of ["full", "half", "bust", "shoulder_head", "head"] as HumanScope[]) {
      const response = await fetch("/__human-bake/template/" + scope),
        stream = response.body!.pipeThrough(new DecompressionStream("gzip"));
      templates.set(
        scope,
        parseHumanTemplate(JSON.parse(await new Response(stream).text()), scope),
      );
    }
    const signal = new AbortController().signal;
    for (const item of work.work as { source: string; scopes: HumanScope[] }[]) {
      const response = await fetch("/__human-bake/source/" + item.source);
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (digest !== item.source) throw Error("source hash mismatch");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      for (const scope of item.scopes) {
        try {
          const url = await renderHumanReference(templates.get(scope), text, signal, 256);
          const blob = await (await fetch(url)).blob();
          const saved = await fetch("/__human-bake/poster/" + item.source + "/" + scope, {
            method: "POST",
            headers: { "X-Bake-Nonce": work.nonce, "Content-Type": "image/png" },
            body: blob,
          });
          if (!saved.ok) throw Error("local PNG verification failed");
          written++;
          if (written <= 5) {
            const image = new Image();
            image.src = url;
            await image.decode();
            document.querySelector("#samples")!.append(image);
          }
        } catch (error) {
          failures.push({ source: item.source, scope, error: String(error) });
        }
      }
      status.textContent = JSON.stringify(
        {
          written,
          required_source_rows: work.source_rows,
          unique_sources: work.total_sources,
          seconds: (performance.now() - started) / 1000,
          failures,
        },
        null,
        2,
      );
    }
    const final = await (
      await fetch("/__human-bake/finish", {
        method: "POST",
        headers: { "X-Bake-Nonce": work.nonce },
      })
    ).json();
    status.textContent = JSON.stringify(
      { final, written, seconds: (performance.now() - started) / 1000, failures },
      null,
      2,
    );
  } catch (error) {
    status.textContent += "\n" + String(error);
  } finally {
    button.disabled = false;
  }
};
