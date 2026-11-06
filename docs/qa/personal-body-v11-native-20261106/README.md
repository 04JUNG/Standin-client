# v11 native compatibility and migration — 2026-11-06

On macOS 26.6.2 arm64, v11 passed real native registration/replacement,
stale-cache/snapshot, FBX/CS3C apply/export/restart/delete-preservation and
cancellation checks. A separate debug QA app is built and byte-pinned.
**This is not geometry-quality, CSP, live BFF, Windows/Intel or release approval.**

## Explicit compatibility

Build and native retained-host gates accept only these reviewed pairs:

| Contract revision | Converter |
| --- | --- |
| 5 | `personal-converter/10` |
| 6 | `personal-converter/11` |

Both require importer `personal-import/4`, normalization `personal-normalize/5`,
rig mapping `personal-rig/2`, camera `personal-camera/1`, storage `personal-fbx/1`
and material contract `personal-solid-specular/1`. Top-level, hello and
model-manifest version sections must agree. Native hello matches the adjacent
shipped contract and has a valid converter fingerprint. Registration receipts
must match that verified hello. Unknown/string revisions, crossed version pairs
and unsupported versions fail. Existing file/hash/architecture/release gates
remain; this is not a numeric `>=` allowance.

Client baseline: `b0be9f6e03a28a6c197b277a062eb729455e7814`.
Compatibility/app source: `35e0136cf9cd230b18f0772116bd955f4228bf68`.
Server candidate: `7616e491fc500cbfec04fc9fe4defce93fa5776e`.
Accepting the v11 CSP name-handling contract does not qualify deformation quality.

## Runtime integrity and v10 source incident

The original v10 package still has manifest pin
`eaac3841c8b9e693ff88c959eabaceaf1ecc298e547eede748e83ad4a0de1d70`, but current
bytes **FAIL**: 538 listed `.pyc` files changed and three unlisted
`cpython-314.pyc` files appeared. It was not repaired, executed or used as a
successful package here. Mutation cause was not established. Earlier passing
audits describe their earlier snapshot, not the current original-package bytes.

Two preserved v10 app runtimes independently passed all 6,591 file hashes with
no missing/extra files. Migration uses the preserved Connection QA app. The v11
candidate, fresh generated resource and finished app runtime each passed all
**6,606** files, missing0/changed0/extra0, with manifest
`2540a161e19fa34ad1d9c38bcc79751d471b938f6de5b0757923e303def5789b`.
The v11 manifest explicitly includes the three cp314 cache files; these are
pinned v11 bytes, not unlisted files or a restored v10 package. Runtime delta
also includes current server outline/skin/library modules. File identity was
not inferred from the converter-version label alone. All 195 inspected native
Mach-O files are arm64. No direct Blender invocation was used here; packaged
jobs inherited `PYTHONDONTWRITEBYTECODE=1`.

## Actual migration and regression checks

The opt-in migration test calls the same registration/replacement function as
the product picker, with real workers, a permitted male original CS3C and the
previously authorized recorded BVH. Same-v10 duplicate registration reuses its
card. Switching to v11 rejects the old model before apply. Explicit re-registration
preserves public ID/name/createdAt, increments card version to 2, changes worker
ID/fingerprint and removes old worker cache while retaining the v10 user export.
Old snapshots fail; fresh v11 apply starts uncached and a repeat reuses its
artifact. Worker deletion preserves both versions' FBX exports. Storage uses a
separate Korean/space path.

Three further actual tests passed female FBX and male original CS3C registration,
restart, apply, SHA-verified FBX export, delete while preserving exports, and
active cancellation without a partial published model. This is native IPC/core
acceptance; the connection owner separately checks picker/product UI/HTTP fixture.

Node packaging5 and Rust native units6 passed; six runtime opt-ins were initially
ignored, then the four relevant actual cases above passed explicitly. Clippy
`-D warnings` and normal-wrapper debug app build passed. No frontend selection
source, geometry algorithm or deformation safety gate was edited.

## Immutable v11 QA app

- `Standin Personal v11 Connection QA 20261106.app`.
- Identifier and compile Keychain namespace:
  `app.standin.desktop.personal-connection-v11-qa-20261106`.
- Deep link: `standin-personal-connection-v11-qa-20261106`.
- Both Mock flags false, `http://localhost:8000`, interactive preview true,
  updater endpoints empty; separate appdata/keyring from v10 and production.
- Keyring namespace verified in rustc `env-dep`; no credential values read.
- Native binary SHA256:
  `265d37b474084916da59ecf6638228aed3b0f7f924b0473f29ec0351fe85b5f7`.
- Whole app tree SHA256:
  `3fe201675c9f551066ef4a9f7cbfcc45506de3dae5e2645cdb502e38b049ef3d`
  (6,610 files; each SHA + two spaces + relative POSIX path + LF, directory-sorted).

[evidence.json](evidence.json) records input/pose/output hashes, fingerprints and
verdicts. Full local file manifest, audits, logs and absolute handoff paths are
in shared platform-v11 artifacts. No raw model, decoder payload or runtime is a
Git asset. Windows/Intel execution, geometry, actual CSP and public release gates
remain separate. Draft/default-off/releaseReady:false persist. No deployment,
merge, release, original-app overwrite or direct PR159 push occurred; the
connection owner is the sole publisher of the reviewed handoff commits.
