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

// Preserve the supplied PNG. macOS gets a fully opaque navy square behind it so
// the system does not add a gray legacy plate around the transparent artwork.
const directory = mkdtempSync(path.join(tmpdir(), "standin-icons-"));
try {
  const windowsOnly = process.argv.includes("--windows");
  const source = readFileSync("src-tauri/icons/standinLogo.png");
  const macSource = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2048" height="2048" viewBox="0 0 2048 2048"><rect width="2048" height="2048" fill="#152238"/><image width="2048" height="2048" xlink:href="data:image/png;base64,${source.toString("base64")}"/></svg>`,
  );
  const input = path.join(directory, "standinLogo-macos.svg");
  writeFileSync(input, macSource);
  const base = path.join(directory, "desktop"),
    mac = path.join(directory, "macos"),
    windows = path.join(directory, "windows");
  mkdirSync(base);
  mkdirSync(mac);
  mkdirSync(windows);
  const inputs = [["src-tauri/icons/windows-icon.svg", windows]];
  if (!windowsOnly)
    inputs.push(["src-tauri/icons/standinLogo.png", base], [input, mac]);
  for (const [file, output] of inputs) {
    execFileSync(
      process.execPath,
      ["node_modules/@tauri-apps/cli/tauri.js", "icon", file, "--output", output],
      { stdio: "pipe" },
    );
  }
  const check = process.argv.includes("--check");
  const publicSource = "public/standinLogo.png";
  if (!windowsOnly && check) {
    if (!source.equals(readFileSync(publicSource)))
      throw new Error(`Stale icon source: ${publicSource}`);
  } else if (!windowsOnly) {
    mkdirSync("public", { recursive: true });
    writeFileSync(publicSource, source);
  }
  const assets = windowsOnly
    ? ["icon.ico"]
    : readdirSync(base).filter((name) => /\.(png|ico|icns)$/.test(name));
  for (const name of assets) {
    const generated = path.join(
      name === "icon.icns" ? mac : name === "icon.ico" ? windows : base,
      name,
    );
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
    `${check ? "Verified" : "Generated"} ${assets.length} ${windowsOnly ? "Windows" : "desktop"} icons; Windows uses the square S mark`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
