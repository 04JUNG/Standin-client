/** All normal installer entry points share the explicit, hash-pinned runtime gate. */
import path from "node:path";
import { spawn } from "node:child_process";
import { prepareLocalRuntime } from "./tauri-personal-body.mjs";
const args = process.argv.slice(2);
const env = { ...process.env };
if (args[0] === "build") {
  // A plain build deliberately omits this optional capability. It cannot accidentally ship an old local resource.
  env.VITE_PERSONAL_BODY_ENABLED = "false";
  if (env.STANDIN_LOCAL_CONVERTER_PACKAGE) {
    const i = args.indexOf("--target");
    const target = i >= 0 ? args[i + 1] : args.find((a) => a.startsWith("--target="))?.slice(9);
    const runtime = await prepareLocalRuntime({ target, development: args.includes("--debug") });
    args.push(
      "--config",
      path.resolve(import.meta.dirname, "../src-tauri/tauri.personal-body.conf.json"),
    );
    env.VITE_PERSONAL_BODY_ENABLED = "true";
    console.log(
      `Personal deforme runtime: ${runtime.target}, manifest SHA256 ${runtime.manifestHash}`,
    );
  }
}
const child = spawn(
  process.execPath,
  [path.resolve(import.meta.dirname, "../node_modules/@tauri-apps/cli/tauri.js"), ...args],
  { stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 1));
