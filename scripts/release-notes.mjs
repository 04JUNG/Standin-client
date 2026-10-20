import { readFile, writeFile, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateCatalog, formatNotes } from "../releases/catalog.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const pkg = await readJson("../package.json");
const catalog = validateCatalog(await readJson("../releases/notes.json"));
const release = catalog.find((entry) => entry.version === pkg.version);
if (!release) throw new Error(`Add release notes for ${pkg.version} before building a release`);
const tauri = await readJson("../src-tauri/tauri.conf.json");
const cargo = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
if (
  tauri.version !== pkg.version ||
  cargo.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1] !== pkg.version
)
  throw new Error("package.json, Tauri and Cargo versions must match");
const notes = formatNotes(release);
if (process.argv.includes("--github-output")) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  const install = await readFile(new URL("../releases/install.md", import.meta.url), "utf8");
  const delimiter = `notes_${randomUUID()}`;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `body<<${delimiter}\n${notes}\n\n${install}\n${delimiter}\n`,
  );
}
const manifestArg = process.argv.indexOf("--manifest");
if (manifestArg >= 0) {
  const path = process.argv[manifestArg + 1];
  if (!path) throw new Error("--manifest requires a path");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.version.replace(/^v/, "") !== pkg.version)
    throw new Error("Updater version mismatch");
  for (const target of ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"]) {
    const platform = manifest.platforms?.[target] ?? manifest.platforms?.[`${target}-nsis`];
    if (!platform?.signature?.trim() || !platform?.url?.startsWith("https://"))
      throw new Error(`Missing signed updater artifact for ${target}`);
  }
  manifest.notes = notes;
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`Release notes validated: ${pkg.version}`);
