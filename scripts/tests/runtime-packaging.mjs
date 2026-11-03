import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const digest = (data) => createHash("sha256").update(data).digest("hex");
test("standard build entry: absent capability, pin, contract, target, integrity, copy reuse and release gates", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "personal-runtime-test-"));
  try {
    await mkdir(path.join(temp, "scripts"));
    for (const f of ["tauri.mjs", "tauri-personal-body.mjs"])
      await cp(new URL("../" + f, import.meta.url), path.join(temp, "scripts", f));
    await mkdir(path.join(temp, "node_modules/@tauri-apps/cli"), { recursive: true });
    await writeFile(
      path.join(temp, "node_modules/@tauri-apps/cli/tauri.js"),
      `console.log(JSON.stringify({enabled:process.env.VITE_PERSONAL_BODY_ENABLED,args:process.argv.slice(2)}));`,
    );
    const source = path.join(temp, "source");
    await mkdir(source);
    const contract = JSON.stringify({
      contractRevision: 3,
      results: { hello: { cameraContractVersion: "personal-camera/1" } },
    });
    await writeFile(path.join(source, "converter-client-contract.v1.json"), contract);
    await writeFile(path.join(source, "launcher"), "vetted bytes");
    const manifest = {
      protocolVersion: "standin.local-converter/1",
      target: `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
      requiresUserInstalledRuntime: false,
      releaseReady: false,
      files: {
        "converter-client-contract.v1.json": digest(contract),
        launcher: digest("vetted bytes"),
      },
    };
    const bytes = JSON.stringify(manifest);
    await writeFile(path.join(source, "runtime-manifest.json"), bytes);
    const env = {
      ...process.env,
      STANDIN_LOCAL_CONVERTER_PACKAGE: source,
      STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256: digest(bytes),
    };
    const run = (extra = {}, args = ["build", "--debug"]) =>
      spawnSync(process.execPath, [path.join(temp, "scripts/tauri.mjs"), ...args], {
        env: { ...env, ...extra },
        encoding: "utf8",
      });
    assert.equal(run({ STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256: "" }).status, 1);
    assert.equal(run({}, ["build"]).status, 1); // releaseReady:false can never enter a public release.
    assert.equal(run({}, ["build", "--debug", "--target", "universal-apple-darwin"]).status, 1);
    const enabled = run();
    assert.equal(enabled.status, 0, enabled.stderr);
    assert.match(enabled.stdout, /"enabled":"true"/);
    assert.match(enabled.stdout, /tauri.personal-body.conf.json/);
    assert.equal(run().status, 0); // identical verified resources are reusable.
    await writeFile(path.join(temp, "src-tauri/resources/local-converter/launcher"), "tampered");
    assert.equal(run().status, 1); // even an existing matching manifest is not a trusted copy.
    const disabled = run({
      STANDIN_LOCAL_CONVERTER_PACKAGE: "",
      STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256: "",
    });
    assert.equal(disabled.status, 0);
    assert.match(disabled.stdout, /"enabled":"false"/);
    assert.doesNotMatch(disabled.stdout, /tauri.personal-body.conf.json/);
    assert.equal(await readFile(path.join(source, "launcher"), "utf8"), "vetted bytes");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
