# Personal-body platform QA — 2026-11-06

macOS arm64 passed actual local FBX/CS3C adapter and relocated-runtime checks.
Windows and Intel Mac personal-converter execution remains **UNVERIFIED**.
Geometry quality, CSP and live BFF are separate acceptance gates and remain
unqualified here. Draft/default-off/releaseReady:false are unchanged.

| Target | Build / static evidence | Actual local converter | Release |
| --- | --- | --- | --- |
| macOS arm64, 26.6.2 | Two isolated debug QA apps; 6,591 runtime files/hash pin checked | PASS: permitted female FBX and male original CS3C, recorded offline selected BVH | UNVERIFIED signing/notarization and redistribution |
| macOS Intel | Synthetic layout/native-header rejection tests; earlier updater CI is unrelated | UNVERIFIED: no target pin or exposed Intel host | UNVERIFIED |
| Windows x64 | Existing PR159 Windows Server 2025 compile/clippy/unit CI passed | UNVERIFIED: five packaged-runtime tests ignored; no Windows runtime pin | UNVERIFIED |

The app source is `7f3ff3565a424512b2f9eaed1baeb924a170cb0b`: connection
integration `ae3224a3ab3d254658de5e6403d7007c41e25ecd` plus packaging commit
`ad149c4`. Develop was freshly fetched at
`65a43657194f87f244075d6ba24fa76d9b71b703`. Native adapter source was unchanged
from PR159 baseline `a473b525b76b7ea3917b56c81346ea9cf7742f1e`.

## Immutable apps and runtime

Both debug apps use the normal build wrapper, separate app IDs/deep links,
empty updater endpoints and immutable v10 manifest
`eaac3841c8b9e693ff88c959eabaceaf1ecc298e547eede748e83ad4a0de1d70`.
Source, prior generated resource, prior app and both new apps each contain the
same 6,591 hash-pinned runtime files, zero modified/extra files. All 195 native
Mach-O files inspected are thin arm64; Blender/Python executable permissions
and linked dependencies were inspected. Actual conversion exercised them.

| QA app | Environment | Native binary SHA256 |
| --- | --- | --- |
| Standin Personal Platform QA 20261106 | localhost:8000, both Mock flags true | `91bf47b624514a7d70d42d382b570c44b1787412074f04caf450c42eb87ecb1d` |
| Standin Personal Connection QA 20261106 | localhost:8000, both Mock flags false, interactive preview true | `7af1288f9f2b6fbcf3d22042070405079712d503ddcc4b56bda096f316f63d6a` |

Full app tree hashes, overlay hashes, input/pose/output hashes and precise scope
are in [evidence.json](evidence.json). The HTTP app is prepared for the
connection owner's controlled local fixture; building it is not a successful
live BFF or product UI run. The platform owner did not operate native UI.

## Actual checks

Three opt-in Rust adapter tests passed: female FBX and male original CS3C
registration, process restart/card reload, pose application, FBX export with
SHA check, model deletion preserving the user export, and import cancellation
without publishing a model. Input, TMPDIR/storage and output paths used Korean
and spaces; the original app resource path contained spaces. Invalid inherited
Python/Blender user settings did not replace the bundled isolated interpreter.

The new HTTP QA app's exact runtime was additionally copied without preserving
timestamps into a separate Korean/space path. Public IPC passed registration,
restart inspection, apply and cache reuse, changed-pose rejection, unsupported
hands rejection, stale-snapshot rejection, destination no-overwrite, CS3C
conversion/export, active cancellation, EOF cancellation/cleanup and deletion
preserving both FBX exports. The relocated runtime remained 6,591 files,
changed0/extra0 after repeated starts. First verified host startup was 10.704s;
this is a local measurement, not a performance guarantee.

The restricted sandbox attempt returned CONVERSION_FAILED during female
registration. The same actual test passed with authorized local child-process
execution outside that sandbox. The failed attempt is retained separately and
is not reported as a pass or established product bug.

Native unit checks: five passed, five real-runtime opt-ins initially ignored;
three relevant opt-ins were then run explicitly as above. Process-boundary
regressions used real POSIX children for cancellation/timeout/memory-limit
termination and storage-lock isolation. These do not establish Windows
process-tree cleanup. Full product appdata/picker/UI flow belongs to the
connection owner; Windows LocalAppData handling is static inspection only.

## Fail-closed packaging changes

The client build gate now rejects unlisted files/directories, symlinks/special
files, malformed paths, missing required hash entries, modified bytes, wrong
native architecture and missing executable permissions. It verifies both the
source and reused generated tree. A missing file or manifest in an existing
resource directory fails rather than copying into that directory. Four synthetic
packaging tests passed; they cover Mach-O arm64/Intel and PE AMD64 headers,
without claiming to execute those synthetic binaries.

Server packaging/startup source is separately handed to the PR142 owner as
`49082929748175aca7289710813c572a9539169b`. It adds header checks before copying,
exact startup file/hash validation and host OS/architecture checks. **No v10
runtime bytes were changed, and its existing entry does not contain these new
startup guards.** The next adopted package needs a new immutable
version/manifest/fingerprint and native acceptance rerun. No geometry code or
safety gate changed. Server regression: 26 collected, 22 passed/four Blender
skips; four new synthetic artifact tests; smoke54 passed using the existing
project Python environment; compileall/diff checks passed. Merged client clippy
passed with `-D warnings`, as did both actual debug app builds.

[Historical CI 41952084112](https://github.com/04JUNG/Standin-client/actions/runs/41952084112)
ran Windows AMD64 and **macOS arm64**, not Intel. Windows had 18 unit passes;
macOS had 19. Both ignored five packaged-runtime tests. No new private models,
decoder payloads or runtime binaries were uploaded to CI, and no new machine,
paid service, signing key, deployment, release or PR merge was used.

Remaining: actual Windows/Intel runtime packages and execution, signing and
redistribution, geometry quality, supported CSP import/joints/.clip save/reopen,
and live installation-owned BFF acceptance. A successful local file save does
not close these gates. No newly qualified deformation runtime was handed off.
