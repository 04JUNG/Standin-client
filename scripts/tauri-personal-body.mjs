/** Build-time packaging only. End users never install a separate conversion runtime. */
import { cp, mkdir, readFile, stat, lstat, readdir, open } from "node:fs/promises";
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
  if (!["darwin-arm64", "darwin-x64", "windows-x64"].includes(target))
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
  await verifyRuntimeFiles(source, manifest);
  const destination = path.join(root, "src-tauri/resources/local-converter");
  await mkdir(path.dirname(destination), { recursive: true });
  // Never merge two versions. Provide a fresh resource directory for each package.
  const destinationInfo = await lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (destinationInfo) {
    if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink())
      throw new Error("Generated runtime resource must be a real directory.");
    const existing = await readFile(path.join(destination, "runtime-manifest.json"));
    if (createHash("sha256").update(existing).digest("hex") !== manifestHash)
      throw new Error(
        "Remove the previous generated local-converter resource directory before packaging another runtime.",
      );
    await verifyRuntimeFiles(destination, manifest);
    return { manifestHash, target };
  }
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false,
  });
  await verifyRuntimeFiles(destination, manifest);
  return { manifestHash, target };
}

// Verify the exact artifact, including reused generated resources. No unlisted
// module, stale decoder, symlink or special file may join a pinned runtime.
export async function verifyRuntimeFiles(directory, manifest) {
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
    throw new Error("Runtime directory must be a real directory.");
  if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files))
    throw new Error("Runtime file manifest is required.");
  const files = new Set(Object.keys(manifest.files));
  const launcher =
    manifest.target === "windows-x64" ? "standin-local-converter.cmd" : "standin-local-converter";
  if (manifest.schemaVersion !== 1 || manifest.launcher !== launcher)
    throw new Error("Invalid runtime manifest schema or launcher.");
  for (const required of [
    launcher,
    "entry.py",
    "converter-client-contract.v1.json",
    manifest.blender,
    manifest.python,
  ])
    if (typeof required !== "string" || !files.has(required))
      throw new Error("Required runtime entry is not hash pinned.");
  for (const [relative, expected] of Object.entries(manifest.files)) {
    if (
      !relative ||
      relative.includes("\\") ||
      relative.includes(":") ||
      relative.split("/").some((part) => !part || part === "." || part === "..") ||
      relative === "runtime-manifest.json" ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      throw new Error("Invalid runtime artifact manifest entry.");
  }
  async function walk(folder, prefix = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const file = path.join(folder, entry.name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error("Runtime artifact symlinks are not supported.");
      if (info.isDirectory()) {
        if (!Object.keys(manifest.files).some((name) => name.startsWith(relative + "/")))
          throw new Error(`Unlisted runtime artifact directory: ${relative}`);
        await walk(file, relative + "/");
      } else if (info.isFile()) {
        if (relative === "runtime-manifest.json") continue;
        if (!files.has(relative)) throw new Error(`Unlisted runtime artifact file: ${relative}`);
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        if (hash.digest("hex") !== manifest.files[relative])
          throw new Error(`Runtime artifact integrity check failed: ${relative}`);
        files.delete(relative);
      } else throw new Error("Unsupported runtime artifact file type.");
    }
  }
  // Keep the complete set while traversing sibling directories.
  const listed = new Set(files);
  await walk(directory);
  if (files.size) throw new Error("Runtime artifact is missing listed files.");
  for (const relative of [launcher, manifest.blender, manifest.python]) {
    if (!listed.has(relative)) throw new Error("Missing runtime executable.");
    if (
      manifest.target.startsWith("darwin-") &&
      process.platform !== "win32" &&
      !((await stat(path.join(directory, relative))).mode & 0o111)
    )
      throw new Error("Runtime executable permission is missing.");
  }
  for (const relative of [manifest.blender, manifest.python])
    await verifyExecutableTarget(path.join(directory, relative), manifest.target);
}

async function verifyExecutableTarget(file, target) {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(64);
    if ((await handle.read(header, 0, header.length, 0)).bytesRead !== header.length)
      throw new Error("Truncated runtime executable.");
    if (target === "darwin-arm64" || target === "darwin-x64") {
      const cpu = target === "darwin-arm64" ? 0x0100000c : 0x01000007;
      if (
        header.readUInt32LE(0) !== 0xfeedfacf ||
        header.readUInt32LE(4) !== cpu ||
        header.readUInt32LE(12) !== 2
      )
        throw new Error("Runtime executable architecture does not match target.");
    } else if (target === "windows-x64") {
      const offset = header.readUInt32LE(0x3c);
      const pe = Buffer.alloc(26);
      if (
        header.toString("ascii", 0, 2) !== "MZ" ||
        offset < 64 ||
        offset > 1024 * 1024 ||
        (await handle.read(pe, 0, pe.length, offset)).bytesRead !== pe.length ||
        pe.readUInt32LE(0) !== 0x00004550 ||
        pe.readUInt16LE(4) !== 0x8664 ||
        pe.readUInt16LE(24) !== 0x20b
      )
        throw new Error("Runtime executable architecture does not match target.");
    } else throw new Error("Unsupported runtime executable target.");
  } finally {
    await handle.close();
  }
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
