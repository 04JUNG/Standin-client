import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = process.env.STANDIN_E2E_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error("STANDIN_E2E_ROOT must be absolute");
const command = process.argv[2];
const run = (program, args) => {
  const result = spawnSync(program, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${program} failed: ${result.error ?? result.stderr}`);
};
const env = (name, value) => {
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
};
const json = (name, value) => writeFileSync(path.join(root, name), JSON.stringify(value, null, 2));
const versions = { a: "0.1.1-beta.9", b: "0.1.1-beta.10" };

if (command === "init") {
  env("STANDIN_E2E_ROOT", root);
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, "packages"), { recursive: true });
  mkdirSync(path.join(root, "evidence"), { recursive: true });
  const password = randomUUID();
  const key = path.join(root, "updater-test.key");
  // This is a throwaway updater key; no production updater private key is used.
  run(process.execPath, [
    "node_modules/@tauri-apps/cli/tauri.js",
    "signer",
    "generate",
    "--ci",
    "-p",
    password,
    "-w",
    key,
  ]);
  const openssl =
    process.platform === "win32"
      ? ([
          "C:/Program Files/Git/mingw64/bin/openssl.exe",
          "C:/Program Files/Git/usr/bin/openssl.exe",
        ].find(existsSync) ?? "openssl")
      : "openssl";
  const tlsConfig = path.join(root, "tls.cnf");
  writeFileSync(
    tlsConfig,
    [
      "[req]",
      "distinguished_name=dn",
      "prompt=no",
      "[dn]",
      "CN=Standin updater test CA",
      "[root]",
      "basicConstraints=critical,CA:TRUE",
      "keyUsage=critical,keyCertSign,cRLSign",
      "[server]",
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "",
    ].join("\n"),
  );
  run(openssl, [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    path.join(root, "ca.key"),
    "-out",
    path.join(root, "ca.crt"),
    "-days",
    "2",
    "-config",
    tlsConfig,
    "-extensions",
    "root",
  ]);
  run(openssl, [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    path.join(root, "tls.key"),
    "-out",
    path.join(root, "tls.csr"),
    "-subj",
    "/CN=localhost",
  ]);
  run(openssl, [
    "x509",
    "-req",
    "-in",
    path.join(root, "tls.csr"),
    "-CA",
    path.join(root, "ca.crt"),
    "-CAkey",
    path.join(root, "ca.key"),
    "-CAcreateserial",
    "-out",
    path.join(root, "tls.crt"),
    "-days",
    "2",
    "-extfile",
    tlsConfig,
    "-extensions",
    "server",
  ]);
  env("TAURI_SIGNING_PRIVATE_KEY", key);
  env("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", password);
  env("STANDIN_E2E_CA", path.join(root, "ca.crt"));
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${password}`);
  json("versions.json", versions);
} else if (command === "version") {
  const version = versions[process.argv[3]];
  if (!version) throw new Error("Expected a or b");
  run(process.execPath, ["scripts/set-version.mjs", version]);
  const notesPath = "releases/notes.json";
  const notes = JSON.parse(readFileSync(notesPath, "utf8"));
  if (!notes.some((entry) => entry.version === versions.b)) {
    notes.push({
      version: versions.b,
      date: "2026-10-20",
      title: "서명된 업데이트 검증 B",
      features: ["설치 후 새 바이너리에서 변경 내역을 표시합니다."],
      improvements: [],
      fixes: [],
    });
    writeFileSync(notesPath, JSON.stringify(notes, null, 2));
  }
  const config = {
    productName: "Standin Updater QA",
    identifier: "app.standin.desktop.update-e2e",
    build: {
      beforeBuildCommand:
        "node node_modules/vite/bin/vite.js build --config scripts/update-e2e/vite.config.ts",
      frontendDist: "../e2e-dist",
    },
    plugins: {
      "deep-link": { desktop: { schemes: ["standin-update-e2e"] } },
      updater: {
        pubkey: readFileSync(path.join(root, "updater-test.key.pub"), "utf8").trim(),
        endpoints: ["https://127.0.0.1:17443/latest.json"],
      },
    },
    bundle: { createUpdaterArtifacts: true },
  };
  json("tauri.e2e.json", config);
} else if (command === "stage") {
  const label = process.argv[3];
  if (!["a", "b"].includes(label)) throw new Error("Expected a or b");
  const target = process.env.E2E_TARGET;
  if (!target) throw new Error("E2E_TARGET required");
  const bundle = path.join("src-tauri", "target", target, "release", "bundle");
  const destination = path.join(root, "packages", label);
  mkdirSync(destination, { recursive: true });
  for (const kind of process.platform === "win32" ? ["nsis"] : ["dmg", "macos"]) {
    for (const name of readdirSync(path.join(bundle, kind))) {
      if (
        /\.(exe|sig|dmg|tar\.gz)$/.test(name) &&
        (name.includes(versions[label]) || /\.app\.tar\.gz(?:\.sig)?$/.test(name))
      )
        copyFileSync(path.join(bundle, kind, name), path.join(destination, name));
    }
  }
  console.log(`Staged ${label}: ${readdirSync(destination).join(", ")}`);
} else throw new Error(`Unknown prepare command: ${command}`);
