import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, copyFileSync, rmSync } from "node:fs";
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

// Keep the supplied SVG as the canonical package source; never regenerate from PNG.
const directory = mkdtempSync(path.join(tmpdir(), "standin-icons-"));
try {
  execFileSync(
    process.execPath,
    [
      "node_modules/@tauri-apps/cli/tauri.js",
      "icon",
      "src-tauri/icons/favicon.svg",
      "--output",
      directory,
    ],
    { stdio: "pipe" },
  );
  const check = process.argv.includes("--check");
  const source = readFileSync("src-tauri/icons/favicon.svg");
  if (check && !source.equals(readFileSync("public/favicon.svg")))
    throw new Error("Browser favicon differs from package source");
  if (!check) copyFileSync("src-tauri/icons/favicon.svg", "public/favicon.svg");
  const assets = readdirSync(directory).filter((name) => /\.(png|ico|icns)$/.test(name));
  for (const name of assets) {
    const generated = path.join(directory, name);
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
    `${check ? "Verified" : "Generated"} ${assets.length} desktop icons from favicon.svg`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
