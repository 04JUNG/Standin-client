# Interactive pose preview — local real-model integration

The opt-in client now connects to the BFF operation transport and the private Converter HTTP service. `VITE_INTERACTIVE_POSE_PREVIEW` remains false by default. Main and floating-bar Top5 cards use one shared renderer and prebuilt approved GLBs. Visible enlargement/reset overlays are removed; dragging, explicit selection and keyboard enlargement remain.

## Common authority and export

Converter adapter `post-frozen-file-canonical-snapshot-v2` freezes the hand/refine/shape-applied private FBX once. It imports that file before publishing the immutable canonical display packet. Final export copies those exact bytes and independently reimports them in a fresh Blender process; the existing strict joint/topology/vertex/skin/split-normal comparison is unchanged. Re-exporting the snapshot was unsuitable because Blender quantizes custom split normals on each FBX round trip. The frozen solver, file validators and initial/intermediate FBX dependencies are retained.

The client verifies original typed-f64be canonical bytes and state hash, all skin influences, operation/revision/source identity, bounded geometry, receipt/header/length and downloaded file hash. A local hand draft immediately invalidates final-file readiness. Only a newly verified current server revision permits download. Converter uses the BFF operation expiry; missing/expired private handles revoke ready and retry obtains a fresh revision. App↔bar retains controllers; ownership, body/refine/scope changes, expiry, deletion and session eviction revoke stale work and release compiled hand surfaces.

The v2 projection preserves continuous search rotation and torso-normalized perspective/orthographic projection, with documented server-owned square scope framing. The client never fits model bounds or rounds yaw. Double-sided interactive materials preserve outer surfaces when the exact search projection reverses screen winding. Model geometry and normals are unchanged.

## Static Top5 and hands

Converter static resolution reads an offline, hash-verified asset manifest and GLBs; card requests never launch Blender. BFF binds every asset to current owned-job candidate source, approved character and scope, and rechecks source/quarantine/ownership/body before byte delivery. Missing manifest coverage retains the legacy path; no global library-coverage claim is made. BFF exposes `interactivePreview` only after complete coverage for the returned candidate set.

After final verification, owner-bound recent hand combinations can be downloaded from `/{operationId}/variants`. The client hashes the table, checks exact state/binding/library identities, precompiles complete surfaces within its aggregate budget and switches cached variants synchronously. Unsupported or uncached combinations wait for the server. This does not advertise all 79 presets or arbitrary combinations as precompiled; uploaded personal FBX/CS3C do not gain capability.

## Verification (2026-11-04)

- Real recorded analysis observations, source BVH and continuous fitted camera; actual refine v2.5.4 accepted `ok_partial`. No VLM-generated coordinates or paid inference.
- Base, left-hand change and refine+hand: real BFF Converter transport, canonical client consumer and independent final FBX correspondence all pass with maximum joint/vertex/skin/normal errors 0.
- Real approved male/female: all five scopes; female fat/muscle extremes; mirrored orthographic male. Thirteen additional independent FBX correspondence cases pass at error 0.
- Five distinct actual Top5 source poses were prebuilt and verified; all 5/5 GLBs pass their SHA checks. They are private local artifacts, excluded from git.
- Top5 fresh-JS-cache loopback runs, n=20: first-frame p50/p95 51.6/56.6ms; all-five p50/p95 99.9/144.8ms. HTTP cache may be warm; search/server/GPU completion are excluded. Shared renderer CPU submission p95 1.0ms across 132 draws, with an initial maximum 34.9ms. These are local measurements, not fleet or legacy-JPEG improvement claims.
- Actual client HTTP → BFF Hono/PGlite operation queue → live private Converter → verified FBX/hash download → cancellation denial passes. PGlite omits PostgreSQL advisory locking; native disk save is not inferred from HTTP delivery.
- Browser uses production `PoseViewerPage`, `BarCandidatesPage`, shared viewer and actual approved model data. Cached hand switch, after six warm-up frames, 40 samples: p50 16.7ms, p95 19.6ms, maximum 21.7ms; 100ms target passes. This QA-only measurement waits for WebGL GPU completion (`gl.finish`), excludes server/network/display presentation, and is one local device/browser run. It does not prove uncached solve or export is faster than legacy PNG.
- Client full regression, typecheck, lint and production build; BFF full regression and private transport tests; Converter host contracts, smoke suite and Blender regression controls. Artifact-backed tests are separate from hermetic CI and never treated as automatic passes when assets are absent.

## Reproduction

The old `/samples/interactive.html` is a procedural layout fixture. `/samples/real.html` is the actual-model QA entry. Populate ignored `samples/.local-real/` with licensed local verification packets/receipts and case manifest, verified hand table and the five offline GLBs/manifest. The page explicitly identifies recorded analysis replay; it does not claim a live user job or native save. No private artifacts are bundled in the production build or committed.

```sh
STANDIN_REAL_PACKET_DIR=/private/local/verification \
NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-real-artifacts.test.mjs

STANDIN_BFF_WORKTREE=/path/to/built/BFF \
STANDIN_REAL_PACKET_DIR=/private/local/verification \
STANDIN_REAL_BVH_FILE=/private/approved/source.bvh \
NODE_OPTIONS=--no-experimental-webstorage npm test -- scripts/interactive-bff-wire.test.mjs
```

BFF/Converter deployment flags and internal token/private volume/static-store configuration are documented in their integration PRs. Native Tauri/OS/CSP import acceptance, production PostgreSQL and fleet performance remain deployment checks. These changes do not deploy, merge, enable production flags or claim full collision safety.
