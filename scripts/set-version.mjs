import { readFile, writeFile } from "node:fs/promises";

const packagePath = new URL("../package.json", import.meta.url);
const tauriConfigPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const cargoPath = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargoLockPath = new URL("../src-tauri/Cargo.lock", import.meta.url);

const packageText = await readFile(packagePath, "utf8");
const packageJson = JSON.parse(packageText);

function requestedVersion() {
  if (process.argv[2] === "--develop-build") {
    const runNumber = process.argv[3];
    if (!/^\d+$/.test(runNumber ?? "")) {
      throw new Error("develop build number must be a positive integer");
    }
    const base = String(packageJson.version).split("-", 1)[0];
    return `${base}-dev.${runNumber}`;
  }
  return process.argv[2];
}

const version = requestedVersion();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version ?? "")) {
  throw new Error("usage: node scripts/set-version.mjs <semver> | --develop-build <run-number>");
}

const tauriConfigText = await readFile(tauriConfigPath, "utf8");
const cargoToml = await readFile(cargoPath, "utf8");
const cargoLock = await readFile(cargoLockPath, "utf8");
const nextPackageText = packageText.replace(/("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`);
const nextTauriConfigText = tauriConfigText.replace(
  /("version"\s*:\s*")[^"]+("\s*,)/,
  `$1${version}$2`,
);
const nextCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\r?\n)/,
  `$1${version}$2`,
);
const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\r?\nname = "standin-desktop"\r?\nversion = ")[^"]+("\r?\n)/,
  `$1${version}$2`,
);
if (!nextPackageText.includes(`"version": "${version}"`)) {
  throw new Error("could not update version in package.json");
}
if (!nextTauriConfigText.includes(`"version": "${version}"`)) {
  throw new Error("could not update version in src-tauri/tauri.conf.json");
}
if (!nextCargoToml.includes(`version = "${version}"`)) {
  throw new Error("could not update [package].version in src-tauri/Cargo.toml");
}
const standinLockPackage = nextCargoLock.match(
  /\[\[package\]\]\r?\nname = "standin-desktop"\r?\nversion = "[^"]+"/,
);
if (!standinLockPackage?.[0].includes(`version = "${version}"`)) {
  throw new Error("could not update standin-desktop version in src-tauri/Cargo.lock");
}

await Promise.all([
  writeFile(packagePath, nextPackageText),
  writeFile(tauriConfigPath, nextTauriConfigText),
  writeFile(cargoPath, nextCargoToml),
  writeFile(cargoLockPath, nextCargoLock),
]);

console.log(`Standin version set to ${version}`);
