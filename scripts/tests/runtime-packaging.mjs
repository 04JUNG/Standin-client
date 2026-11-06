import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const target =
  process.platform === "win32"
    ? "windows-x64"
    : process.platform === "darwin" && process.arch === "x64"
      ? "darwin-x64"
      : "darwin-arm64";
const triple = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "windows-x64": "x86_64-pc-windows-msvc",
};
const launcher =
  target === "windows-x64" ? "standin-local-converter.cmd" : "standin-local-converter";
function executable(target) {
  const bytes = Buffer.alloc(256);
  if (target.startsWith("darwin-")) {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(target === "darwin-arm64" ? 0x0100000c : 0x01000007, 4);
    bytes.writeUInt32LE(2, 12);
  } else {
    bytes.write("MZ");
    bytes.writeUInt32LE(64, 0x3c);
    bytes.writeUInt32LE(0x00004550, 64);
    bytes.writeUInt16LE(0x8664, 68);
    bytes.writeUInt16LE(0x20b, 88);
  }
  return bytes;
}
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
      contractRevision: 5,
      results: {
        hello: {
          cameraContractVersion: "personal-camera/1",
          modelStorageVersion: "personal-fbx/1",
          materialContractVersion: "personal-solid-specular/1",
        },
      },
    });
    await writeFile(path.join(source, "converter-client-contract.v1.json"), contract);
    await writeFile(path.join(source, launcher), "vetted bytes");
    await writeFile(path.join(source, "entry.py"), "entry");
    for (const name of ["blender", "python"]) {
      await writeFile(path.join(source, name), executable(target));
      await chmod(path.join(source, name), 0o755);
    }
    await chmod(path.join(source, launcher), 0o755);
    const manifest = {
      protocolVersion: "standin.local-converter/1",
      schemaVersion: 1,
      target,
      launcher,
      blender: "blender",
      python: "python",
      requiresUserInstalledRuntime: false,
      releaseReady: false,
      files: {
        "converter-client-contract.v1.json": digest(contract),
        [launcher]: digest("vetted bytes"),
        "entry.py": digest("entry"),
        blender: digest(executable(target)),
        python: digest(executable(target)),
      },
    };
    const bytes = JSON.stringify(manifest);
    await writeFile(path.join(source, "runtime-manifest.json"), bytes);
    const env = {
      ...process.env,
      STANDIN_LOCAL_CONVERTER_PACKAGE: source,
      STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256: digest(bytes),
    };
    const run = (extra = {}, args = ["build", "--debug", "--target", triple[target]]) =>
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
    const destination = path.join(temp, "src-tauri/resources/local-converter");
    await writeFile(path.join(source, "stale-decoder.py"), "extra");
    assert.equal(run().status, 1); // source extras cannot enter or hide behind a reused copy.
    await rm(path.join(source, "stale-decoder.py"));
    await writeFile(path.join(destination, "old-cache.pyc"), "extra");
    assert.equal(run().status, 1);
    await rm(path.join(destination, "old-cache.pyc"));
    await rm(path.join(destination, "entry.py"));
    assert.equal(run().status, 1); // missing file never triggers copying into an existing tree.
    await assert.rejects(readFile(path.join(destination, "entry.py")));
    await writeFile(path.join(destination, "entry.py"), "entry");
    await rm(path.join(destination, "runtime-manifest.json"));
    assert.equal(run().status, 1);
    await writeFile(path.join(destination, "runtime-manifest.json"), bytes);
    if (process.platform !== "win32") {
      await rm(path.join(destination, launcher));
      await symlink(path.join(source, launcher), path.join(destination, launcher));
      assert.equal(run().status, 1); // matching content through an external link is not a package.
      await rm(path.join(destination, launcher));
      await writeFile(path.join(destination, launcher), "vetted bytes");
      await chmod(path.join(destination, launcher), 0o755);
    }
    await writeFile(path.join(temp, "src-tauri/resources/local-converter", launcher), "tampered");
    assert.equal(run().status, 1); // even an existing matching manifest is not a trusted copy.
    const disabled = run({
      STANDIN_LOCAL_CONVERTER_PACKAGE: "",
      STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256: "",
    });
    assert.equal(disabled.status, 0);
    assert.match(disabled.stdout, /"enabled":"false"/);
    assert.doesNotMatch(disabled.stdout, /tauri.personal-body.conf.json/);
    assert.equal(await readFile(path.join(source, launcher), "utf8"), "vetted bytes");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

// Synthetic headers exercise cross-target selection only. They never certify OS execution.
import { verifyRuntimeFiles } from "../tauri-personal-body.mjs";
for (const target of Object.keys(triple)) {
  test(`exact artifact and native headers: ${target} (synthetic, not execution)`, async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "personal-architecture-test-"));
    const launcher =
      target === "windows-x64" ? "standin-local-converter.cmd" : "standin-local-converter";
    const content = {
      [launcher]: "launcher",
      "entry.py": "entry",
      "converter-client-contract.v1.json": "{}",
      blender: executable(target),
      python: executable(target),
    };
    const manifest = {
      schemaVersion: 1,
      target,
      launcher,
      blender: "blender",
      python: "python",
      files: Object.fromEntries(Object.entries(content).map(([k, v]) => [k, digest(v)])),
    };
    try {
      for (const [name, bytes] of Object.entries(content)) {
        await writeFile(path.join(temp, name), bytes);
        await chmod(path.join(temp, name), 0o755);
      }
      await writeFile(path.join(temp, "runtime-manifest.json"), JSON.stringify(manifest));
      await verifyRuntimeFiles(temp, manifest);
      const wrong = executable(target === "darwin-arm64" ? "darwin-x64" : "darwin-arm64");
      await writeFile(path.join(temp, "python"), wrong);
      const mislabeled = { ...manifest, files: { ...manifest.files, python: digest(wrong) } };
      await assert.rejects(verifyRuntimeFiles(temp, mislabeled), /architecture/);
      await writeFile(path.join(temp, "python"), content.python);
      for (const relative of ["../escape", "/absolute", "a/../entry.py", "C:/runtime", "a\\b"]) {
        await assert.rejects(
          verifyRuntimeFiles(temp, {
            ...manifest,
            files: { ...manifest.files, [relative]: digest("x") },
          }),
          /manifest entry/,
        );
      }
      const missing = { ...manifest.files };
      delete missing[launcher];
      await assert.rejects(
        verifyRuntimeFiles(temp, { ...manifest, files: missing }),
        /not hash pinned/,
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}
