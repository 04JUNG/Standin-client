/** Build-time packaging only. End users never install a separate conversion runtime. */
import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
export async function prepareLocalRuntime({ target: requestedTarget, development = false } = {}) {
  const source = process.env.STANDIN_LOCAL_CONVERTER_PACKAGE;
  if (!source || !path.isAbsolute(source))
    throw new Error(
      "Build requires STANDIN_LOCAL_CONVERTER_PACKAGE pointing to a vetted runtime artifact.",
    );
  const manifestBytes = await readFile(path.join(source, "runtime-manifest.json"));
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  if (
    !/^[a-f0-9]{64}$/.test(process.env.STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256 ?? "") ||
    manifestHash !== process.env.STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256
  )
    throw new Error("Pinned runtime manifest SHA256 is required and must match.");
  const manifest = JSON.parse(manifestBytes);
  if (!development && manifest.releaseReady !== true)
    throw new Error("Runtime is not qualified for public release.");
  const targets = {
    "aarch64-apple-darwin": "darwin-arm64",
    "x86_64-apple-darwin": "darwin-x64",
    "x86_64-pc-windows-msvc": "windows-x64",
  };
  const target = requestedTarget
    ? targets[requestedTarget]
    : `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  if (!target)
    throw new Error(
      "No qualified runtime for requested target (universal runtime is not available).",
    );
  if (
    manifest.protocolVersion !== "standin.local-converter/1" ||
    manifest.target !== target ||
    manifest.requiresUserInstalledRuntime !== false
  )
    throw new Error("Runtime artifact does not match this target or protocol.");
  const contract = JSON.parse(
    await readFile(path.join(source, "converter-client-contract.v1.json"), "utf8"),
  );
  if (
    contract.contractRevision !== 5 ||
    contract.results?.hello?.cameraContractVersion !== "personal-camera/1" ||
    contract.results?.hello?.modelStorageVersion !== "personal-fbx/1" ||
    contract.results?.hello?.materialContractVersion !== "personal-solid-specular/1"
  )
    throw new Error("Runtime camera contract mismatch.");
  async function verifyFiles(directory) {
    for (const [relative, expected] of Object.entries(manifest.files)) {
      const file = path.resolve(directory, relative);
      if (!file.startsWith(path.resolve(directory) + path.sep) || !(await stat(file)).isFile())
        throw new Error("Invalid runtime artifact file.");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      if (hash.digest("hex") !== expected)
        throw new Error(`Runtime artifact integrity check failed: ${relative}`);
    }
  }
  await verifyFiles(source);
  const destination = path.join(root, "src-tauri/resources/local-converter");
  await mkdir(path.dirname(destination), { recursive: true });
  // Never merge two versions. Provide a fresh resource directory for each package.
  try {
    await stat(destination);
    const existing = await readFile(path.join(destination, "runtime-manifest.json"));
    if (createHash("sha256").update(existing).digest("hex") === manifestHash) {
      await verifyFiles(destination);
      return { manifestHash, target };
    }
    throw new Error(
      "Remove the previous generated local-converter resource directory before packaging another runtime.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false,
  });
  await verifyFiles(destination);
  return { manifestHash, target };
}
const args = process.argv.slice(2);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, "tauri-personal-body.mjs")
) {
  if (args.includes("--prepare-only")) {
    const index = args.indexOf("--target");
    const target =
      index >= 0 ? args[index + 1] : args.find((a) => a.startsWith("--target="))?.slice(9);
    await prepareLocalRuntime({ target, development: args.includes("--debug") });
  } else {
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/tauri.mjs"), "build", ...args],
      { cwd: root, stdio: "inherit" },
    );
    child.on("exit", (code) => process.exit(code ?? 1));
  }
}
