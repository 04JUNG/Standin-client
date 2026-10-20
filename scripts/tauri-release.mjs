// tauri-action calls this before collecting/uploading artifacts. The updater
// signature must cover the final archive, including its notarization ticket.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const cli = path.resolve("node_modules/@tauri-apps/cli/tauri.js");
const args = process.argv.slice(2);
function run(command, argv, env = process.env) {
  const result = spawnSync(command, argv, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${path.basename(command)} exited with ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}
function capture(command, argv) {
  const result = spawnSync(command, argv, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(command)} exited with ${result.status}`);
  return result.stdout;
}
async function stapler(action, app) {
  const backoff = [3000, 10000, 20000, 40000];
  for (let attempt = 0; attempt <= backoff.length; attempt += 1) {
    try {
      run("xcrun", ["stapler", action, app]);
      return;
    } catch (error) {
      // Error 68 is Apple's ticket-service communication failure. A missing or
      // invalid ticket (65) still fails immediately; never skip validation.
      if (error.exitCode !== 68 || attempt === backoff.length) throw error;
      console.log(`Apple ticket service unavailable; retrying ${action} (${attempt + 1}/4).`);
      await delay(backoff[attempt]);
    }
  }
}

function signDmg(dmg, work) {
  const { APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY } = process.env;
  if (!APPLE_CERTIFICATE || APPLE_CERTIFICATE_PASSWORD === undefined || !APPLE_SIGNING_IDENTITY)
    throw new Error("Apple signing credentials are required to repair the DMG");
  const certificate = path.join(work, "signing.p12");
  const keychain = path.join(work, "signing.keychain-db");
  const password = randomUUID();
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${password}`);
  writeFileSync(certificate, Buffer.from(APPLE_CERTIFICATE, "base64"), { mode: 0o600 });
  // Tauri removes its temporary signing keychain before returning to this wrapper.
  // Use another private keychain and restore the search list when signing finishes.
  const originalKeychains = capture("security", ["list-keychains", "-d", "user"])
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  run("security", ["create-keychain", "-p", password, keychain]);
  try {
    run("security", ["unlock-keychain", "-p", password, keychain]);
    run("security", ["set-keychain-settings", "-t", "3600", "-u", keychain]);
    run("security", [
      "import",
      certificate,
      "-k",
      keychain,
      "-f",
      "pkcs12",
      "-t",
      "agg",
      "-P",
      APPLE_CERTIFICATE_PASSWORD,
      "-T",
      "/usr/bin/codesign",
    ]);
    run("security", [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:,codesign:",
      "-s",
      "-k",
      password,
      keychain,
    ]);
    run("security", ["list-keychains", "-d", "user", "-s", ...originalKeychains, keychain]);
    const identities = [
      ...capture("security", ["find-identity", "-v", "-p", "codesigning", keychain]).matchAll(
        /^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"/gm,
      ),
    ];
    if (identities.length !== 1) throw new Error("Expected one valid Apple signing identity");
    run("codesign", [
      "--force",
      "--sign",
      identities[0][1],
      "--keychain",
      keychain,
      "--timestamp",
      dmg,
    ]);
    run("codesign", ["--verify", "--verbose=2", dmg]);
  } finally {
    try {
      run("security", ["list-keychains", "-d", "user", "-s", ...originalKeychains]);
    } finally {
      run("security", ["delete-keychain", keychain]);
    }
  }
}

async function verifyDmg(dmg, app) {
  const work = mkdtempSync(path.join(os.tmpdir(), "standin-verify-dmg-"));
  const mount = path.join(work, "mounted");
  mkdirSync(mount);
  let mounted = false;
  const mountedApp = path.join(mount, path.basename(app));
  const inspect = async (image) => {
    run("hdiutil", ["attach", image, "-readonly", "-nobrowse", "-mountpoint", mount]);
    mounted = true;
    try {
      run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", mountedApp]);
      await stapler("validate", mountedApp);
    } finally {
      run("hdiutil", ["detach", mount]);
      mounted = false;
    }
  };
  try {
    run("codesign", ["--verify", "--verbose=2", dmg]);
    console.log("Repacking the DMG with the verified, stapled app.");
    // Preserve Tauri's volume layout/background. Only replace the contained app
    // with the same signed build whose ticket was already validated above.
    const writable = path.join(work, "writable.dmg");
    const complete = path.join(work, "complete.dmg");
    run("hdiutil", ["convert", dmg, "-format", "UDRW", "-o", writable]);
    // ditto can keep the old executable allocated while replacing it. Tauri's
    // tightly sized image has insufficient spare room for a universal binary.
    // Grow the private working image and its HFS+ filesystem before copying;
    // the original signed DMG is replaced only after all verification succeeds.
    const workingMiB = Math.ceil(statSync(writable).size / (1024 * 1024)) * 2 + 32;
    console.log(`Reserving ${workingMiB} MiB for DMG app replacement.`);
    run("hdiutil", ["resize", "-size", `${workingMiB}m`, writable]);
    run("hdiutil", ["attach", writable, "-nobrowse", "-mountpoint", mount]);
    mounted = true;
    try {
      run("ditto", [app, mountedApp]);
      run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", mountedApp]);
      await stapler("validate", mountedApp);
    } finally {
      run("hdiutil", ["detach", mount]);
      mounted = false;
    }
    run("hdiutil", ["convert", writable, "-format", "UDZO", "-o", complete]);
    signDmg(complete, work);
    await inspect(complete);
    copyFileSync(complete, dmg);
  } finally {
    // macOS only, private directory created by this call.
    if (!mounted) rmSync(work, { recursive: true, force: true });
  }
}
run(process.execPath, [cli, ...args]);

if (
  args[0] === "build" &&
  process.platform === "darwin" &&
  process.env.STANDIN_VERIFY_MACOS_UPDATER === "true"
) {
  const targetIndex = args.indexOf("--target");
  const target =
    targetIndex >= 0
      ? args[targetIndex + 1]
      : args.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  if (!target || !/^[a-z0-9_-]+$/.test(target)) throw new Error("Explicit --target required");
  const directory = path.resolve(
    "src-tauri/target",
    target,
    args.includes("--debug") ? "debug" : "release",
    "bundle/macos",
  );
  const apps = readdirSync(directory).filter((name) => name.endsWith(".app"));
  if (apps.length !== 1) throw new Error("Expected exactly one macOS app bundle");
  const app = path.join(directory, apps[0]);
  const archive = `${app}.tar.gz`;
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  // Bundling can report success while a subsequent archive has no ticket.
  // Fetching an already-issued ticket needs no extra signing credentials.
  await stapler("staple", app);
  await stapler("validate", app);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  const dmgDirectory = path.resolve(directory, "../dmg");
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  if (existsSync(dmgDirectory)) {
    for (const name of readdirSync(dmgDirectory)) {
      if (name.endsWith(".dmg") && name.includes(`_${version}_`))
        await verifyDmg(path.join(dmgDirectory, name), app);
    }
  }
  run("tar", ["-czf", archive, "-C", directory, apps[0]], {
    ...process.env,
    COPYFILE_DISABLE: "1",
  });
  const extracted = mkdtempSync(path.join(os.tmpdir(), "standin-verify-updater-"));
  try {
    run("tar", ["-xzf", archive, "-C", extracted]);
    const unpacked = path.join(extracted, apps[0]);
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", unpacked]);
    await stapler("validate", unpacked);
  } finally {
    // macOS only; this directory was created above solely for archive verification.
    rmSync(extracted, { recursive: true, force: true });
  }
  const signingEnv = { ...process.env };
  const key = signingEnv.TAURI_SIGNING_PRIVATE_KEY;
  if (key && existsSync(key)) {
    signingEnv.TAURI_SIGNING_PRIVATE_KEY_PATH = key;
    delete signingEnv.TAURI_SIGNING_PRIVATE_KEY;
  }
  run(process.execPath, [cli, "signer", "sign", archive], signingEnv);
  console.log("Verified and signed the macOS updater archive with its notarization ticket.");
}
