/** Build-time packaging only. End users never install a separate conversion runtime. */
import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const source = process.env.STANDIN_LOCAL_CONVERTER_PACKAGE;
if (!source || !path.isAbsolute(source))
  throw new Error(
    "Build requires STANDIN_LOCAL_CONVERTER_PACKAGE pointing to a vetted runtime artifact.",
  );
const manifest = JSON.parse(await readFile(path.join(source, "runtime-manifest.json"), "utf8"));
const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
if (
  manifest.protocolVersion !== "standin.local-converter/1" ||
  manifest.target !== target ||
  manifest.requiresUserInstalledRuntime !== false
)
  throw new Error("Runtime artifact does not match this target or protocol.");
for (const [relative, expected] of Object.entries(manifest.files)) {
  const file = path.resolve(source, relative);
  if (!file.startsWith(path.resolve(source) + path.sep) || !(await stat(file)).isFile())
    throw new Error("Invalid runtime artifact file.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== expected)
    throw new Error(`Runtime artifact integrity check failed: ${relative}`);
}
const destination = path.join(root, "src-tauri/resources/local-converter");
await mkdir(path.dirname(destination), { recursive: true });
// Never merge two versions. Provide a fresh resource directory for each package.
try {
  await stat(destination);
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
const args = process.argv.slice(2);
if (args.includes("--prepare-only")) process.exit(0);
const cli = path.join(root, "node_modules/@tauri-apps/cli/tauri.js");
const child = spawn(
  process.execPath,
  [cli, "build", "--config", "src-tauri/tauri.personal-body.conf.json", ...args],
  { cwd: root, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
