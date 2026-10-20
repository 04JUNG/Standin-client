import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ICNS chunk order varies across Tauri runs; compare the typed payloads.
function canonicalIcon(bytes, name) {
  if (!name.endsWith(".icns")) return bytes;
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > bytes.length) throw new Error("Invalid ICNS chunk");
    chunks.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return Buffer.concat(chunks.sort((a, b) => a.compare(b)));
}

// Windows/browser use the supplied rounded SVG unchanged. macOS masks the square
// itself; a pre-rounded transparent image receives an extra legacy background on 26.
const directory = mkdtempSync(path.join(tmpdir(), "standin-icons-"));
try {
  const source = readFileSync("src-tauri/icons/favicon.svg");
  const rounded = '<rect width="64" height="64" rx="20" fill="#152238" />';
  if (!source.toString("utf8").includes(rounded))
    throw new Error("Review the macOS background derivation for the updated logo source");
  const macSource = Buffer.from(
    source.toString("utf8").replace(rounded, '<rect width="64" height="64" fill="#152238" />'),
  );
  const input = path.join(directory, "favicon-macos.svg");
  writeFileSync(input, macSource);
  const base = path.join(directory, "desktop"),
    mac = path.join(directory, "macos");
  mkdirSync(base);
  mkdirSync(mac);
  for (const [file, output] of [
    ["src-tauri/icons/favicon.svg", base],
    [input, mac],
  ]) {
    execFileSync(
      process.execPath,
      ["node_modules/@tauri-apps/cli/tauri.js", "icon", file, "--output", output],
      { stdio: "pipe" },
    );
  }
  const check = process.argv.includes("--check");
  for (const [target, data] of [
    ["public/favicon.svg", source],
    ["src-tauri/icons/favicon-macos.svg", macSource],
  ]) {
    if (check) {
      if (!data.equals(readFileSync(target))) throw new Error(`Stale icon source: ${target}`);
    } else writeFileSync(target, data);
  }
  const assets = readdirSync(base).filter((name) => /\.(png|ico|icns)$/.test(name));
  for (const name of assets) {
    const generated = path.join(name === "icon.icns" ? mac : base, name);
    const target = path.join("src-tauri/icons", name);
    if (check) {
      if (
        !canonicalIcon(readFileSync(generated), name).equals(
          canonicalIcon(readFileSync(target), name),
        )
      )
        throw new Error(`Stale package icon: ${name}`);
    } else copyFileSync(generated, target);
  }
  console.log(
    `${check ? "Verified" : "Generated"} ${assets.length} desktop icons; macOS uses an opaque square background`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
