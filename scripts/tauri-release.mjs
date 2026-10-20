// tauri-action calls this before collecting/uploading artifacts. The updater
// signature must cover the final archive, including its notarization ticket.
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const cli = path.resolve("node_modules/@tauri-apps/cli/tauri.js");
const args = process.argv.slice(2);
function run(command, argv, env = process.env) {
  const result = spawnSync(command, argv, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(command)} exited with ${result.status}`);
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
  run("xcrun", ["stapler", "staple", app]);
  run("xcrun", ["stapler", "validate", app]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  run("tar", ["-czf", archive, "-C", directory, apps[0]], {
    ...process.env,
    COPYFILE_DISABLE: "1",
  });
  const extracted = mkdtempSync(path.join(os.tmpdir(), "standin-verify-updater-"));
  try {
    run("tar", ["-xzf", archive, "-C", extracted]);
    const unpacked = path.join(extracted, apps[0]);
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", unpacked]);
    run("xcrun", ["stapler", "validate", unpacked]);
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
