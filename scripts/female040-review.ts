import { parseShapeRuntime } from "../src/features/body-selection/shapeRuntime/format";
import { resolveControls } from "../src/features/body-selection/shapeRuntime/evaluate";
import { mountShapeBody } from "../src/features/body-selection/shapeRuntime/mountShapeBody";

async function main() {
  const [catalog, buffer] = await Promise.all([
    fetch("/api/catalog").then((r) => r.json()),
    fetch("/api/runtime").then((r) => r.arrayBuffer()),
  ]);
  const runtime = parseShapeRuntime(buffer);
  const select = document.querySelector<HTMLSelectElement>("#preset")!;
  const slider = document.querySelector<HTMLInputElement>("#size")!;
  const number = document.querySelector<HTMLInputElement>("#number")!;
  const status = document.querySelector<HTMLElement>("#status")!;
  const value = document.querySelector<HTMLElement>("#value")!;
  const view = mountShapeBody(
    document.querySelector("canvas")!,
    runtime,
    () => (status.textContent = "미리보기 연결이 끊겼습니다."),
  );
  catalog.assets.forEach((asset: { characterId: string; displayName: string }) => {
    const option = document.createElement("option");
    option.value = asset.characterId;
    option.textContent = asset.displayName;
    select.append(option);
  });
  const asset = () =>
    catalog.assets.find((a: { characterId: string }) => a.characterId === select.value);
  const observe = (event: Record<string, unknown>) =>
    fetch("/api/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  function update(size: string) {
    const download = document.querySelector<HTMLAnchorElement>("#download")!;
    download.hidden = true;
    download.removeAttribute("href");
    document.querySelector("#receipt")!.textContent = "";
    status.textContent = `현재 미리보기: 가슴 ${Number(size).toFixed(2)} · 이 체형으로 파일을 새로 만들 수 있습니다.`;
    slider.value = number.value = size;
    value.textContent = Number(size).toFixed(2);
    const a = asset();
    view.update(
      resolveControls(
        runtime,
        a.shapeRuntime?.preset ??
          a.characterId.split("-v")[0].replace("female-", "").replaceAll("-", "_").toUpperCase(),
        { breast_size: Number(size) },
      ),
    );
    void observe({ event: "preview", characterId: select.value, size: Number(size) });
  }
  slider.oninput = () => update(slider.value);
  number.onchange = () => update(number.value);
  select.onchange = () =>
    update(
      String(asset().shape.controls.find((c: { key: string }) => c.key === "breast_size").default),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-size]")
    .forEach((b) => (b.onclick = () => update(b.dataset.size!)));
  document
    .querySelectorAll<HTMLButtonElement>("[data-angle]")
    .forEach(
      (b) => (b.onclick = () => view.setRotation((Number(b.dataset.angle) * Math.PI) / 180)),
    );
  document.querySelector<HTMLButtonElement>("#export")!.onclick = async () => {
    const button = document.querySelector<HTMLButtonElement>("#export")!;
    button.disabled = true;
    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        "input,select,[data-size]",
      ),
    ];
    controls.forEach((control) => (control.disabled = true));
    status.textContent = "선택한 체형의 FBX를 만들고 다시 검사하고 있습니다…";
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: select.value,
          controls: { breast_size: Number(slider.value) },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(result));
      const link = document.querySelector<HTMLAnchorElement>("#download")!;
      link.href = result.downloadUrl;
      link.hidden = false;
      link.textContent = "검증된 FBX 다운로드";
      status.textContent = `가슴 ${Number(slider.value).toFixed(2)} · FBX 재로드 오차 ${result.validation.roundtrip_max_error_mm.toFixed(6)} mm · ${result.seconds.toFixed(1)}초`;
      document.querySelector("#receipt")!.textContent = JSON.stringify(
        { job: result.jobId, fbxSha256: result.fbx_sha256, source: result.shape_source },
        null,
        2,
      );
      await observe({
        event: "file_ready",
        jobId: result.jobId,
        size: Number(slider.value),
        sha256: result.fbx_sha256,
      });
    } catch (error) {
      status.textContent = String(error);
    } finally {
      button.disabled = false;
      controls.forEach((control) => (control.disabled = false));
    }
  };
  update("0");
  status.textContent = "미리보기 준비 완료 · 여성 11종 · −1 ~ +2 (0.01 간격)";
}
main().catch((error) => (document.querySelector("#status")!.textContent = String(error)));
